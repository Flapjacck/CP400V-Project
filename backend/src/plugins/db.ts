import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import pg from 'pg'

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error('Missing env: DATABASE_URL')
  }
  const pool = new pg.Pool({
    connectionString: dbUrl,
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