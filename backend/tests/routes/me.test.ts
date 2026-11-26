import { test, before } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import authPlugin from '../../src/plugins/auth.js'
import getMe from '../../src/routes/me/get.js'
import updateMe from '../../src/routes/me/update.js'

before(() => {
  process.env.JWT_SECRET =
    'test-jwt-secret-at-least-32-characters-long-for-unit-tests'
})

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CREATED = new Date('2025-01-01T00:00:00Z')

type QueryCall = { text: string; params?: unknown[] }

function createFakeDb(exists = true) {
  const calls: QueryCall[] = []
  const row = {
    id: USER_ID,
    email: 'me@example.com',
    display_name: 'Me',
    bio: 'hi',
    role: 'user',
    created_at: CREATED,
    password_hash: 'secret',
  }
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (!exists) return { rows: [] }
      if (text.startsWith('UPDATE users')) {
        const updated = { ...row }
        // Params are in SET order, id last.
        const cols = [...text.matchAll(/(display_name|bio) = \$\d/g)].map(
          (m) => m[1]
        )
        cols.forEach((c, i) => {
          ;(updated as Record<string, unknown>)[c] = params?.[i]
        })
        return { rows: [updated] }
      }
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
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await fastify.register(getMe)
  await fastify.register(updateMe)
  const token = fastify.jwt.sign({ sub: USER_ID, role: 'user' })
  return { fastify, db, auth: { authorization: `Bearer ${token}` } }
}

const updates = (db: { calls: QueryCall[] }) =>
  db.calls.filter((c) => c.text.startsWith('UPDATE users'))

test('GET /api/me without a token is 401', async () => {
  const { fastify } = await setup()
  const res = await fastify.inject({ method: 'GET', url: '/api/me' })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('GET /api/me returns the owner with email and createdAt', async () => {
  const { fastify, auth } = await setup()
  const res = await fastify.inject({
    method: 'GET',
    url: '/api/me',
    headers: auth,
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.email, 'me@example.com')
  assert.strictEqual(body.createdAt, CREATED.toISOString())
  assert.ok(!('password_hash' in body))
  await fastify.close()
})

test('GET /api/me for a deleted user is 401', async () => {
  const { fastify, auth } = await setup(false)
  const res = await fastify.inject({
    method: 'GET',
    url: '/api/me',
    headers: auth,
  })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('PATCH /api/me without a token is 401', async () => {
  const { fastify, db } = await setup()
  const res = await fastify.inject({
    method: 'PATCH',
    url: '/api/me',
    payload: { bio: 'x' },
  })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(updates(db).length, 0)
  await fastify.close()
})

test('PATCH /api/me updates displayName, bio, or both with parameters', async () => {
  const cases: [Record<string, string>, unknown[]][] = [
    [{ displayName: '  New  ' }, ['New', USER_ID]],
    [{ bio: ' new bio ' }, ['new bio', USER_ID]],
    [{ displayName: 'N', bio: 'B' }, ['N', 'B', USER_ID]],
  ]
  for (const [payload, params] of cases) {
    const { fastify, db, auth } = await setup()
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: auth,
      payload,
    })
    assert.strictEqual(res.statusCode, 200)
    const body = res.json()
    if ('displayName' in payload) assert.strictEqual(body.displayName, params[0])
    if ('bio' in payload) {
      assert.strictEqual(body.bio, params[params.length - 2])
    }
    assert.ok(!('password_hash' in body))
    const [call] = updates(db)
    assert.deepStrictEqual(call.params, params)
    assert.ok(!call.text.includes('New') && !call.text.includes('new bio'))
    await fastify.close()
  }
})

test('PATCH /api/me for a deleted user is 401', async () => {
  const { fastify, auth } = await setup(false)
  const res = await fastify.inject({
    method: 'PATCH',
    url: '/api/me',
    headers: auth,
    payload: { bio: 'x' },
  })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('PATCH /api/me rejects role, email, empty, blank name and long bio', async () => {
  const bad: Record<string, unknown>[] = [
    { role: 'admin' },
    { email: 'x@example.com' },
    { bio: 'x', role: 'admin' },
    {},
    { displayName: '   ' },
    { bio: 'a'.repeat(501) },
  ]
  for (const payload of bad) {
    const { fastify, db, auth } = await setup()
    const res = await fastify.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: auth,
      payload,
    })
    assert.strictEqual(res.statusCode, 400, JSON.stringify(payload))
    assert.strictEqual(updates(db).length, 0)
    await fastify.close()
  }
})
