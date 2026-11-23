import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { createStorage, type Storage } from '../lib/storage.js'

declare module 'fastify' {
  interface FastifyInstance {
    storage: Storage
  }
}

const storagePlugin: FastifyPluginAsync = async (fastify) => {
  const storage = createStorage()
  fastify.decorate('storage', storage)
  fastify.addHook('onClose', async () => {
    storage.destroy()
  })
}

export default fp(storagePlugin)