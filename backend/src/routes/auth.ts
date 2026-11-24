import bcrypt from 'bcryptjs'
import type { FastifyPluginAsync } from 'fastify'
import {
  REFRESH_COOKIE_NAME,
  newRefreshToken,
  refreshCookieOptions,
  saveRefreshToken,
} from '../lib/tokens.js'

const BCRYPT_ROUNDS = 10

const signupBodySchema = {
  type: 'object',
  required: ['email', 'password', 'displayName'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 72 },
    displayName: { type: 'string', minLength: 1, maxLength: 50 },
  },
} as const

const userResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    displayName: { type: 'string' },
    bio: { type: 'string' },
    role: { type: 'string', enum: ['user', 'admin'] },
  },
} as const

// Response schema blocks password_hash from ever showing up in JSON.
const signupResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    accessToken: { type: 'string' },
    user: userResponseSchema,
  },
} as const

type SignupBody = {
  email: string
  password: string
  displayName: string
}

// Insert-only uniqueness; Postgres 23505 means the email is taken.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  )
}

// Login, refresh, and logout are added in later issues.

const auth: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SignupBody }>(
    '/api/auth/signup',
    {
      schema: {
        body: signupBodySchema,
        response: {
          201: signupResponseSchema,
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

      const passwordHash = await bcrypt.hash(
        request.body.password,
        BCRYPT_ROUNDS
      )

      const client = await fastify.db.connect()
      let user: {
        id: string
        email: string
        display_name: string
        bio: string
        role: 'user' | 'admin'
      }

      // User row and refresh token hash commit together or not at all.
      try {
        await client.query('BEGIN')
        const insertUser = await client.query<{
          id: string
          email: string
          display_name: string
          bio: string
          role: 'user' | 'admin'
        }>(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, email, display_name, bio, role`,
          [email, passwordHash, displayName]
        )
        user = insertUser.rows[0]

        const refreshRaw = newRefreshToken()
        await saveRefreshToken(client, user.id, refreshRaw)

        await client.query('COMMIT')

        reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions())

        const accessToken = await reply.jwtSign({
          sub: user.id,
          role: user.role,
        })

        return reply.code(201).send({
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            bio: user.bio,
            role: user.role,
          },
        })
      } catch (err) {
        await client.query('ROLLBACK')
        if (isUniqueViolation(err)) {
          return reply.code(409).send({ error: 'Email already in use' })
        }
        throw err
      } finally {
        client.release()
      }
    }
  )
}

export default auth