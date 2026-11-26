import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import pg from 'pg'
import { requireEnv } from '../lib/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new pg.Pool({
    connectionString: requireEnv('DATABASE_URL'),
    connectionTimeoutMillis: 2000,
  })
  pool.on('error', (err) => {
    fastify.log.warn({ err }, 'idle database client error')
  })
  fastify.decorate('db', pool)
  fastify.addHook('onClose', async () => {
    await pool.end()
  })
}

export default fp(dbPlugin)