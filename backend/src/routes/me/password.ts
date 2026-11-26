import type { FastifyPluginAsync } from 'fastify'
import { hashPassword, newPasswordSchema, verifyPassword } from '../../lib/passwords.js'
import { errorSchema } from '../../lib/schemas.js'
import {
  REFRESH_COOKIE_NAME,
  newRefreshToken,
  refreshCookieOptions,
  revokeAllRefreshTokens,
  saveRefreshToken,
} from '../../lib/tokens.js'

const changePasswordBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: { type: 'string', minLength: 1, maxLength: 72 },
    newPassword: newPasswordSchema,
  },
} as const

type ChangePasswordBody = {
  currentPassword: string
  newPassword: string
}

const changePassword: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ChangePasswordBody }>(
    '/api/me/password',
    {
      preHandler: fastify.authenticate,
      // Brute-force protection on an authenticated route with a guessable current password.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: changePasswordBodySchema,
        response: {
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { currentPassword, newPassword } = request.body

      const { rows } = await fastify.db.query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [userId]
      )
      const row = rows[0]

      const passwordOk = await verifyPassword(currentPassword, row?.password_hash)
      if (!row) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      // Confirms the caller knows the old password; distinct from a dead token or missing user.
      if (!passwordOk) {
        return reply.code(401).send({ error: 'Current password is incorrect' })
      }

      const passwordHash = await hashPassword(newPassword)

      const client = await fastify.db.connect()
      // Password and session revoke must commit together so half-updated state is impossible.
      try {
        await client.query('BEGIN')
        await client.query(
          `UPDATE users SET password_hash = $1 WHERE id = $2`,
          [passwordHash, userId]
        )
        await revokeAllRefreshTokens(client, userId)
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      // New cookie here so this browser keeps a valid refresh after all old tokens were revoked.
      const raw = newRefreshToken()
      await saveRefreshToken(fastify.db, userId, raw)
      reply.setCookie(REFRESH_COOKIE_NAME, raw, refreshCookieOptions())

      return reply.code(204).send()
    }
  )
}

export default changePassword