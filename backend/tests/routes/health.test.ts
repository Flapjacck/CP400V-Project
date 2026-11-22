import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import app from '../../src/app.js'

test('GET /api/health returns ok', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(app)

  const res = await fastify.inject({ url: '/api/health' })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { status: 'ok' })
})
