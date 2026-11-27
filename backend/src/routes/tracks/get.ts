import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  findTrackById,
  toTrackJson,
  trackIdParamsSchema,
  trackSchema,
} from '../../lib/tracks.js'

const getTrack: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>(
    '/api/tracks/:id',
    {
      schema: {
        params: trackIdParamsSchema,
        response: { 200: trackSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const row = await findTrackById(fastify.db, request.params.id)
      if (!row) return reply.code(404).send({ error: 'Not Found' })
      return reply.code(200).send(toTrackJson(row))
    }
  )
}

export default getTrack
