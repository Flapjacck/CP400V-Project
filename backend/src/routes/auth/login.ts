import type { FastifyPluginAsync } from 'fastify'
import { verifyPassword } from '../../lib/passwords.js'
import { authResponseSchema } from '../../lib/schemas.js'
import {
  REFRESH_COOKIE_NAME,
  newRefreshToken,
  refreshCookieOptions,
  saveRefreshToken,
  signAccessToken,
} from '../../lib/tokens.js'
import { USER_COLUMNS, toUserJson, type UserRow } from '../../lib/users.js'

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 72 },
  },
} as const

type LoginBody = {
  email: string
  password: string
}

const login: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LoginBody }>(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
      // Trim before format:email runs so spaced mixed-case input still validates.
      preValidation: async (request) => {
        const body = request.body
        if (body && typeof body.email === 'string') {
          body.email = body.email.trim().toLowerCase()
        }
      },
    },
    async (request, reply) => {
      const { rows } = await fastify.db.query<UserRow>(
        `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
        [request.body.email]
      )
      const user = rows[0]

      const passwordOk = await verifyPassword(
        request.body.password,
        user?.password_hash
      )
      if (!user || !passwordOk) {
        return reply.code(401).send({ error: 'Invalid email or password' })
      }

      const refreshRaw = newRefreshToken()
      await saveRefreshToken(fastify.db, user.id, refreshRaw)

      reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions())
      const accessToken = await signAccessToken(reply, user)

      return reply.code(200).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )
}

export default login
