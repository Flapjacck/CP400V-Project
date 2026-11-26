import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import type { FastifyPluginAsync } from 'fastify'

// Registered once for the whole app; only routes with config.rateLimit are capped.
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, { global: false })
}

export default fp(rateLimitPlugin)
