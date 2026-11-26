import bcrypt from 'bcryptjs'
import rateLimit from '@fastify/rate-limit'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import {
  REFRESH_COOKIE_NAME,
  findValidRefreshToken,
  newRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  saveRefreshToken,
} from '../lib/tokens.js'

const BCRYPT_ROUNDS = 10

// Keeps login timing similar when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS)

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

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 72 },
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
const authResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    accessToken: { type: 'string' },
    user: userResponseSchema,
  },
} as const

const unauthorizedSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
  },
} as const

type SignupBody = {
  email: string
  password: string
  displayName: string
}

type LoginBody = {
  email: string
  password: string
}

type UserRow = {
  id: string
  email: string
  display_name: string
  bio: string
  role: 'user' | 'admin'
  password_hash?: string
}

function toUserJson(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    role: row.role,
  }
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

// Path must match refreshCookieOptions or the browser keeps a stale cookie.
const REFRESH_COOKIE_CLEAR = { path: '/api/auth' } as const

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_CLEAR)
}

const auth: FastifyPluginAsync = async (fastify) => {
  // Only routes that set config.rateLimit are capped; signup stays open.
  await fastify.register(rateLimit, { global: false })

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

      const passwordHash = await bcrypt.hash(
        request.body.password,
        BCRYPT_ROUNDS
      )

      const client = await fastify.db.connect()
      let user: UserRow
      const refreshRaw = newRefreshToken()

      // User row and refresh token hash commit together or not at all.
      try {
        await client.query('BEGIN')
        const insertUser = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, email, display_name, bio, role`,
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

      const accessToken = await reply.jwtSign({
        sub: user.id,
        role: user.role,
      })

      return reply.code(201).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )

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
      const email = request.body.email

      const { rows } = await fastify.db.query<UserRow>(
        `SELECT id, email, password_hash, display_name, bio, role
         FROM users WHERE email = $1`,
        [email]
      )
      const user = rows[0]

      const hashToCompare = user?.password_hash ?? DUMMY_HASH
      const passwordOk = await bcrypt.compare(
        request.body.password,
        hashToCompare
      )

      if (!user || !passwordOk) {
        return reply
          .code(401)
          .send({ error: 'Invalid email or password' })
      }

      const refreshRaw = newRefreshToken()
      await saveRefreshToken(fastify.db, user.id, refreshRaw)

      reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions())

      const accessToken = await reply.jwtSign({
        sub: user.id,
        role: user.role,
      })

      return reply.code(200).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )

  fastify.post(
    '/api/auth/refresh',
    {
      schema: {
        response: {
          200: authResponseSchema,
          401: unauthorizedSchema,
        },
      },
    },
    async (request, reply) => {
      const raw = request.cookies[REFRESH_COOKIE_NAME]
      if (!raw) {
        clearRefreshCookie(reply)
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const session = await findValidRefreshToken(fastify.db, raw)
      if (!session) {
        clearRefreshCookie(reply)
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const { rows } = await fastify.db.query<UserRow>(
        `SELECT id, email, display_name, bio, role
         FROM users WHERE id = $1`,
        [session.userId]
      )
      const user = rows[0]
      if (!user) {
        clearRefreshCookie(reply)
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      // Role may have changed since the last JWT was issued.
      const accessToken = await reply.jwtSign({
        sub: user.id,
        role: user.role,
      })

      return reply.code(200).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )

  fastify.post('/api/auth/logout', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE_NAME]
    if (raw) {
      await revokeRefreshToken(fastify.db, raw)
    }
    clearRefreshCookie(reply)
    return reply.code(204).send()
  })
}

export default auth