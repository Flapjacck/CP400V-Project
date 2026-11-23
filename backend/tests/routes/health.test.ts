import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import type { Storage } from '../../src/lib/storage.js'
import health from '../../src/routes/health.js'

function fakeDb(ok: boolean) {
  return {
    query: async () => {
      if (!ok) throw new Error('db down')
    },
  }
}

function fakeStorage(ok: boolean): Storage {
  return {
    bucketExists: async () => {
      if (!ok) throw new Error('storage down')
    },
  } as Storage
}

async function injectHealth(dbOk: boolean, storageOk: boolean) {
  const fastify = Fastify({ logger: false })
  fastify.decorate('db', fakeDb(dbOk))
  fastify.decorate('storage', fakeStorage(storageOk))
  await fastify.register(health)
  const res = await fastify.inject({ url: '/api/health' })
  await fastify.close()
  return res
}

test('GET /api/health returns ok when db and storage are up', async () => {
  const res = await injectHealth(true, true)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), {
    status: 'ok',
    db: 'ok',
    storage: 'ok',
  })
})

test('GET /api/health returns 503 when db is down', async () => {
  const res = await injectHealth(false, true)
  assert.strictEqual(res.statusCode, 503)
  assert.deepStrictEqual(res.json(), {
    status: 'degraded',
    db: 'down',
    storage: 'ok',
  })
})

test('GET /api/health returns 503 when storage is down', async () => {
  const res = await injectHealth(true, false)
  assert.strictEqual(res.statusCode, 503)
  assert.deepStrictEqual(res.json(), {
    status: 'degraded',
    db: 'ok',
    storage: 'down',
  })
})