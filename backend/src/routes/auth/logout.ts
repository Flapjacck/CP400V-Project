import type { FastifyPluginAsync } from 'fastify'
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  revokeRefreshToken,
} from '../../lib/tokens.js'

const logout: FastifyPluginAsync = async (fastify) => {
  // Always 204 so a stale or missing cookie still logs the browser out.
  fastify.post('/api/auth/logout', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE_NAME]
    if (raw) {
      await revokeRefreshToken(fastify.db, raw)
    }
    clearRefreshCookie(reply)
    return reply.code(204).send()
  })
}

export default logout
