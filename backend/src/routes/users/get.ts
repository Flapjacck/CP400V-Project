import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  findPublicUserById,
  publicUserSchema,
  toPublicUserJson,
} from '../../lib/users.js'

const getUser: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { id: string }
  }>(
    '/api/users/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: {
            // Reject bad ids here so Postgres never throws and turns this into a 500.
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: publicUserSchema,
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const row = await findPublicUserById(fastify.db, request.params.id)
      if (!row) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      return reply.code(200).send(toPublicUserJson(row))
    }
  )
}

export default getUser
