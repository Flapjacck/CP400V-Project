import type { FastifyPluginAsync } from 'fastify'
import { errorSchema } from '../../lib/schemas.js'
import {
  toUserJson,
  updateUserProfile,
  userResponseSchema,
} from '../../lib/users.js'

// additionalProperties:false is what keeps role and email out of this route.
// minProperties stops an empty body from running a pointless UPDATE.
const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 50 },
    bio: { type: 'string', maxLength: 500 },
  },
} as const

type UpdateBody = { displayName?: string; bio?: string }

const updateMe: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{ Body: UpdateBody }>(
    '/api/me',
    {
      preHandler: fastify.authenticate,
      schema: {
        body: updateBodySchema,
        response: {
          200: userResponseSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const displayName = request.body.displayName?.trim()
      const bio = request.body.bio?.trim()
      // Schema allows non-empty whitespace; we want a real name.
      if (displayName !== undefined && displayName.length === 0) {
        return reply.code(400).send({ error: 'Bad Request' })
      }

      const updated = await updateUserProfile(fastify.db, request.user.sub, {
        displayName,
        bio,
      })
      // Same as GET: no row means the account is gone, so log out.
      if (!updated) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      return reply.code(200).send(toUserJson(updated))
    }
  )
}

export default updateMe
