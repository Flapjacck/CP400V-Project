import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import getUser from '../../src/routes/users/get.js'

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CREATED = new Date('2025-01-01T00:00:00Z')
const UNKNOWN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type QueryCall = { text: string; params?: unknown[] }

function createFakeDb(exists = true) {
  const calls: QueryCall[] = []
  const row = {
    id: USER_ID,
    email: 'hidden@example.com',
    display_name: 'Public Name',
    bio: 'hello world',
    role: 'admin',
    created_at: CREATED,
    password_hash: 'secret',
  }
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (!exists) return { rows: [] }
      if (text.includes('FROM users WHERE id')) return { rows: [row] }
      return { rows: [] }
    },
  }
}

async function setup(exists = true) {
  const db = createFakeDb(exists)
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  fastify.decorate('db', db as never)
  await fastify.register(getUser)
  return { fastify, db }
}

test('GET /api/users/:id returns public fields only', async () => {
  const { fastify, db } = await setup()
  const res = await fastify.inject({
    method: 'GET',
    url: `/api/users/${USER_ID}`,
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.deepStrictEqual(Object.keys(body).sort(), [
    'bio',
    'createdAt',
    'displayName',
    'id',
  ])
  assert.strictEqual(body.id, USER_ID)
  assert.strictEqual(body.displayName, 'Public Name')
  assert.strictEqual(body.bio, 'hello world')
  assert.strictEqual(body.createdAt, CREATED.toISOString())
  assert.ok(!('email' in body))
  assert.ok(!('role' in body))
  assert.ok(!('password_hash' in body))
  assert.strictEqual(db.calls.length, 1)
  assert.ok(!db.calls[0].text.includes('email'))
  assert.deepStrictEqual(db.calls[0].params, [USER_ID])
  await fastify.close()
})

test('GET /api/users/not-a-uuid is 400 and does not hit the db', async () => {
  const { fastify, db } = await setup()
  const res = await fastify.inject({
    method: 'GET',
    url: '/api/users/not-a-uuid',
  })
  assert.strictEqual(res.statusCode, 400)
  const body = res.json()
  assert.ok('error' in body)
  assert.strictEqual(db.calls.length, 0)
  await fastify.close()
})

test('GET /api/users/:id for unknown user is 404', async () => {
  const { fastify } = await setup(false)
  const res = await fastify.inject({
    method: 'GET',
    url: `/api/users/${UNKNOWN_ID}`,
  })
  assert.strictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.json(), { error: 'Not Found' })
  await fastify.close()
})
