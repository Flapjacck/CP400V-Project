import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  deleteTrack,
  findTrackById,
  trackIdParamsSchema,
} from '../../lib/tracks.js'

const deleteTrackRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Params: { id: string } }>(
    '/api/tracks/:id',
    {
      preHandler: fastify.authenticate,
      schema: {
        params: trackIdParamsSchema,
        response: {
          204: { type: 'null' },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // Checking ownership in DELETE prevents a check-then-write race.
      const key = await deleteTrack(fastify.db, request.params.id, request.user.sub)
      if (!key) {
        // Look up only after a miss to choose the correct client-facing status.
        const track = await findTrackById(fastify.db, request.params.id)
        return reply
          .code(track ? 403 : 404)
          .send({ error: track ? 'Forbidden' : 'Not Found' })
      }
      try {
        // Delete the row first so a storage failure cannot leave a broken track.
        await fastify.storage.deleteObject(key)
      } catch (err) {
        // A stray file is safer than a row pointing at a missing object.
        fastify.log.warn({ err, key }, 'track object deletion failed')
      }
      return reply.code(204).send()
    }
  )
}

export default deleteTrackRoute
