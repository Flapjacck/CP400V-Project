import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  cleanTrackFields,
  findTrackById,
  toTrackJson,
  trackIdParamsSchema,
  trackSchema,
  updateTrack,
} from '../../lib/tracks.js'

// Only editable fields are accepted, and a body must request at least one change.
const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
  },
} as const

type UpdateBody = { title?: string; description?: string }

const updateTrackRoute: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Params: { id: string }; Body: UpdateBody }>(
    '/api/tracks/:id',
    {
      preHandler: fastify.authenticate,
      schema: {
        params: trackIdParamsSchema,
        body: updateBodySchema,
        response: {
          200: trackSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const fields = cleanTrackFields(request.body)
      if (!fields) return reply.code(400).send({ error: 'Bad Request' })
      // The user id always comes from the token, never the body.
      const updated = await updateTrack(
        fastify.db,
        request.params.id,
        request.user.sub,
        fields
      )
      if (!updated) {
        // Look up only after a miss to distinguish a missing track from another owner's.
        const track = await findTrackById(fastify.db, request.params.id)
        return reply
          .code(track ? 403 : 404)
          .send({ error: track ? 'Forbidden' : 'Not Found' })
      }
      return reply.code(200).send(toTrackJson(updated))
    }
  )
}

export default updateTrackRoute
