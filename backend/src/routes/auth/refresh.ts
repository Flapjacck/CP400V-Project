import type { FastifyPluginAsync } from 'fastify'
import { authResponseSchema, errorSchema } from '../../lib/schemas.js'
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  findValidRefreshToken,
  signAccessToken,
} from '../../lib/tokens.js'
import { findUserById, toUserJson } from '../../lib/users.js'

const refresh: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/auth/refresh',
    {
      schema: {
        response: {
          200: authResponseSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const raw = request.cookies[REFRESH_COOKIE_NAME]
      const session = raw
        ? await findValidRefreshToken(fastify.db, raw)
        : null
      // Role may have changed since the last JWT, so always re-read the user.
      const user = session
        ? await findUserById(fastify.db, session.userId)
        : null

      if (!user) {
        clearRefreshCookie(reply)
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const accessToken = await signAccessToken(reply, user)

      return reply.code(200).send({
        accessToken,
        user: toUserJson(user),
      })
    }
  )
}

export default refresh
