import { test, before, afterEach } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import authPlugin from '../../src/plugins/auth.js'

const TEST_SECRET =
  'test-jwt-secret-at-least-32-characters-long-for-unit-tests'

before(() => {
  process.env.JWT_SECRET = TEST_SECRET
})

afterEach(() => {
  process.env.JWT_SECRET = TEST_SECRET
})

async function appWithAuth() {
  const fastify = Fastify({ logger: false })
  await fastify.register(authPlugin)

  fastify.get(
    '/protected',
    { preHandler: fastify.authenticate },
    async () => ({ ok: true })
  )
  fastify.get(
    '/admin',
    { preHandler: fastify.requireAdmin },
    async () => ({ ok: true })
  )
  await fastify.ready()
  return fastify
}

test('authenticate returns 401 without token', async () => {
  const fastify = await appWithAuth()
  const res = await fastify.inject({ url: '/protected' })
  assert.strictEqual(res.statusCode, 401)
  assert.deepStrictEqual(res.json(), { error: 'Unauthorized' })
  await fastify.close()
})

test('authenticate returns 401 with junk token', async () => {
  const fastify = await appWithAuth()
  const res = await fastify.inject({
    url: '/protected',
    headers: { authorization: 'Bearer not-a-jwt' },
  })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('authenticate returns 200 with valid token', async () => {
  const fastify = await appWithAuth()
  const token = fastify.jwt.sign({ sub: 'user-1', role: 'user' })
  const res = await fastify.inject({
    url: '/protected',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { ok: true })
  await fastify.close()
})

test('requireAdmin returns 401 without token', async () => {
  const fastify = await appWithAuth()
  const res = await fastify.inject({ url: '/admin' })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('requireAdmin returns 403 for user role', async () => {
  const fastify = await appWithAuth()
  const token = fastify.jwt.sign({ sub: 'user-1', role: 'user' })
  const res = await fastify.inject({
    url: '/admin',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.strictEqual(res.statusCode, 403)
  assert.deepStrictEqual(res.json(), { error: 'Forbidden' })
  await fastify.close()
})

test('requireAdmin returns 200 for admin role', async () => {
  const fastify = await appWithAuth()
  const token = fastify.jwt.sign({ sub: 'admin-1', role: 'admin' })
  const res = await fastify.inject({
    url: '/admin',
    headers: { authorization: `Bearer ${token}` },
  })
  assert.strictEqual(res.statusCode, 200)
  await fastify.close()
})

test('plugin throws when JWT_SECRET is missing', async () => {
  delete process.env.JWT_SECRET
  await assert.rejects(
    async () => {
      const fastify = Fastify({ logger: false })
      await fastify.register(authPlugin)
    },
    /Missing or short env: JWT_SECRET/
  )
})

test('plugin throws when JWT_SECRET is short', async () => {
  process.env.JWT_SECRET = 'short'
  await assert.rejects(
    async () => {
      const fastify = Fastify({ logger: false })
      await fastify.register(authPlugin)
    },
    /Missing or short env: JWT_SECRET/
  )
})