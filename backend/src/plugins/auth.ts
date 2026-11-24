// JWT access tokens plus cookies for refresh (signup sets the cookie; login comes later).
import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: 'user' | 'admin' }
    user: { sub: string; role: 'user' | 'admin' }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

// Bad secret at boot is safer than weak signing at runtime.
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('Missing or short env: JWT_SECRET (min 32 chars)')
  }
  return secret
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = requireJwtSecret()

  await fastify.register(cookie)
  await fastify.register(jwt, {
    secret,
    sign: { expiresIn: '15m' },
  })

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    }
  )

  // Verifies JWT on its own so routes do not have to chain authenticate first.
  fastify.decorate(
    'requireAdmin',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      if (request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden' })
      }
    }
  )
}

export default fp(authPlugin)