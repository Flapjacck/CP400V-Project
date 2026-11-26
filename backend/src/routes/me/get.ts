import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  findUserById,
  toUserJson,
  userResponseSchema,
} from '../../lib/users.js'

const getMe: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/me',
    {
      preHandler: fastify.authenticate,
      schema: {
        response: { 200: userResponseSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const user = await findUserById(fastify.db, request.user.sub)
      // 401 not 404: a deleted user's token is dead, so the frontend should log out.
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      return reply.code(200).send(toUserJson(user))
    }
  )
}

export default getMe
