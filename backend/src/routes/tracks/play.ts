import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import { incrementPlayCount, trackIdParamsSchema } from '../../lib/tracks.js'

const playResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['playCount'],
  properties: {
    playCount: { type: 'number' },
  },
} as const

const playTrack: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/api/tracks/:id/play',
    {
      config: {
        // Stops a script from pumping the count.
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        params: trackIdParamsSchema,
        response: {
          200: playResponseSchema,
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const playCount = await incrementPlayCount(fastify.db, request.params.id)
      if (playCount === null) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      return reply.code(200).send({ playCount })
    }
  )
}

export default playTrack
