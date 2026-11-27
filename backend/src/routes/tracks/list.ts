import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  listRecentTracks,
  toTrackJson,
  trackPageQuerySchema,
  trackPageSchema,
} from '../../lib/tracks.js'

type TrackPageQuery = { limit?: number; before?: string }

const listTracks: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TrackPageQuery }>(
    '/api/tracks',
    {
      schema: {
        querystring: trackPageQuerySchema,
        response: { 200: trackPageSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const page = await listRecentTracks(fastify.db, {
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

export default listTracks
