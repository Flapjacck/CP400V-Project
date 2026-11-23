import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AutoLoad from '@fastify/autoload'
import type { FastifyPluginAsync } from 'fastify'
import dbPlugin from './plugins/db.js'
import storagePlugin from './plugins/storage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const options = {}

const app: FastifyPluginAsync = async (fastify, opts) => {
  await fastify.register(dbPlugin)
  await fastify.register(storagePlugin)
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts),
  })
}

export default app
