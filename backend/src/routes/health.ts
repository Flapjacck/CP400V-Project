import type { FastifyPluginAsync } from 'fastify'

const CHECK_TIMEOUT_MS = 2000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('health check timeout')), ms)
    }),
  ])
}

type CheckStatus = 'ok' | 'down'

const health: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async (request, reply) => {
    let db: CheckStatus = 'ok'
    let storage: CheckStatus = 'ok'

    const [dbResult, storageResult] = await Promise.allSettled([
      withTimeout(fastify.db.query('SELECT 1'), CHECK_TIMEOUT_MS),
      withTimeout(fastify.storage.bucketExists(), CHECK_TIMEOUT_MS),
    ])

    if (dbResult.status === 'rejected') {
      db = 'down'
      request.log.warn(
        { err: dbResult.reason },
        'health check: database unavailable'
      )
    }
    if (storageResult.status === 'rejected') {
      storage = 'down'
      request.log.warn(
        { err: storageResult.reason },
        'health check: storage unavailable'
      )
    }

    const allOk = db === 'ok' && storage === 'ok'
    const status = allOk ? 'ok' : 'degraded'
    const code = allOk ? 200 : 503

    return reply.code(code).send({ status, db, storage })
  })
}

export default health