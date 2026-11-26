import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import app from '../src/app.js'

// Guards dirNameRoutePrefix: the auth/ folder must not add /auth to the URLs.
test('app serves auth routes at /api/auth/* from routes/auth/', async () => {
  process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none'
  process.env.JWT_SECRET = 'x'.repeat(32)
  process.env.S3_ENDPOINT = 'http://127.0.0.1:1'
  process.env.S3_BUCKET = 'b'
  process.env.S3_REGION = 'us-east-1'
  process.env.S3_ACCESS_KEY = 'k'
  process.env.S3_SECRET_KEY = 's'

  const fastify = Fastify({ logger: false })
  await fastify.register(app)
  await fastify.ready()

  for (const name of ['signup', 'login', 'refresh', 'logout']) {
    assert.ok(
      fastify.hasRoute({ method: 'POST', url: `/api/auth/${name}` }),
      `missing /api/auth/${name}`
    )
    assert.ok(
      !fastify.hasRoute({ method: 'POST', url: `/auth/api/auth/${name}` })
    )
  }
  assert.ok(fastify.hasRoute({ method: 'GET', url: '/api/health' }))
  assert.ok(fastify.hasRoute({ method: 'GET', url: '/api/me' }))
  assert.ok(fastify.hasRoute({ method: 'PATCH', url: '/api/me' }))
  assert.ok(fastify.hasRoute({ method: 'GET', url: '/api/users/:id' }))
  await fastify.close()
})
