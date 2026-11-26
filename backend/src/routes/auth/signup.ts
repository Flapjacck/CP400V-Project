import type { FastifyPluginAsync } from 'fastify'
import { isUniqueViolation } from '../../lib/db.js'
import { hashPassword, newPasswordSchema } from '../../lib/passwords.js'
import { authResponseSchema } from '../../lib/schemas.js'
import {
  REFRESH_COOKIE_NAME,
  newRefreshToken,
  refreshCookieOptions,
  saveRefreshToken,
  signAccessToken,
} from '../../lib/tokens.js'
import { USER_COLUMNS, toUserJson, type UserRow } from '../../lib/users.js'

const signupBodySchema = {
  type: 'object',
  required: ['email', 'password', 'displayName'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: newPasswordSchema,
    displayName: { type: 'string', minLength: 1, maxLength: 50 },
  },
} as const

type SignupBody = {
  email: string
  password: string
  displayName: string
}

const signup: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SignupBody }>(
    '/api/auth/signup',
    {
      schema: {
        body: signupBodySchema,
        response: {
          201: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase()
      const displayName = request.body.displayName.trim()
      // Schema allows non-empty whitespace; we want a real name.
      if (displayName.length === 0) {
        return reply.code(400).send({ error: 'Bad Request' })
      }

      const passwordHash = await hashPassword(request.body.password)

      const client = await fastify.db.connect()
      let user: UserRow
      const refreshRaw = newRefreshToken()

      // User row and refresh token hash commit together or not at all.
      try {
        await client.query('BEGIN')
        const insertUser = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES ($1, $2, $3)
           RETURNING ${USER_COLUMNS}`,
          [email, passwordHash, displayName]
        )
        user = insertUser.rows[0]

        await saveRefreshToken(client, user.id, refreshRaw)

        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        if (isUniqueViolation(err)) {
          return reply.code(409).send({ error: 'Email already in use' })
        }
        throw err
      } finally {
        client.release()
      }

      reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions())
      const accessToken = await signAccessToken(reply, user)

      return reply.code(201).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )
}

export default signup
