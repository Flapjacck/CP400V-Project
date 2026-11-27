import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import { sendTrackFile } from '../../lib/streaming.js'
import { trackIdParamsSchema } from '../../lib/tracks.js'

const streamTrack: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>(
    '/api/tracks/:id/stream',
    {
      schema: {
        params: trackIdParamsSchema,
        response: { 400: errorSchema, 404: errorSchema, 416: errorSchema },
      },
    },
    (request, reply) => sendTrackFile(fastify, request, reply, { attachment: false })
  )
}

export default streamTrack
