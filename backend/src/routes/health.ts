import type { FastifyPluginAsync } from 'fastify'

/**
 * Health check endpoint for Kubernetes and monitoring systems.
 * Returns a simple status indicator without database checks.
 */
const health: FastifyPluginAsync = async (fastify, opts) => {
  fastify.get('/api/health', async function (request, reply) {
    return { status: 'ok' }
  })
}

export default health
