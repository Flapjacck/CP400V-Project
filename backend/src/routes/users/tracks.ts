import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  listTracksByOwner,
  toTrackJson,
  trackPageQuerySchema,
  trackPageSchema,
} from '../../lib/tracks.js'
import { findPublicUserById } from '../../lib/users.js'

type TrackPageQuery = { limit?: number; before?: string }

const listUserTracks: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string }; Querystring: TrackPageQuery }>(
    '/api/users/:id/tracks',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: trackPageQuerySchema,
        response: { 200: trackPageSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      // Check separately so an unknown user is not confused with an empty upload list.
      const user = await findPublicUserById(fastify.db, request.params.id)
      if (!user) return reply.code(404).send({ error: 'Not Found' })
      try {
        const page = await listTracksByOwner(fastify.db, request.params.id, {
          limit: request.query.limit ?? 20,
          before: request.query.before,
        })
        return reply.send({
          tracks: page.rows.map(toTrackJson),
          nextBefore: page.nextBefore,
        })
      } catch (err) {
        if (err instanceof Error && err.message === 'Unknown track cursor') {
          return reply.code(400).send({ error: 'Bad Request' })
        }
        throw err
      }
    }
  )
}

export default listUserTracks
