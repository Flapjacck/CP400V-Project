import assert from 'node:assert'
import { before, test } from 'node:test'
import Fastify from 'fastify'
import type { Storage } from '../../src/lib/storage.js'
import authPlugin from '../../src/plugins/auth.js'
import deleteTrack from '../../src/routes/tracks/delete.js'
import updateTrack from '../../src/routes/tracks/update.js'

const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TRACK_ID = '11111111-1111-1111-1111-111111111111'
const MISSING_ID = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2025-01-01T00:00:00Z')

before(() => {
  process.env.JWT_SECRET =
    'test-jwt-secret-at-least-32-characters-long-for-unit-tests'
})

type QueryCall = { text: string; params?: unknown[] }

function track(ownerId = OWNER_ID) {
  return {
    id: TRACK_ID,
    owner_id: ownerId,
    title: 'Original title',
    description: 'Original description',
    object_key: `tracks/${TRACK_ID}`,
    content_type: 'audio/mpeg',
    size_bytes: '42',
    play_count: '0',
    created_at: NOW,
    updated_at: NOW,
    owner_display_name: ownerId === OWNER_ID ? 'Owner' : 'Other',
  }
}

function fakeDb(options: { ownerId?: string; exists?: boolean } = {}) {
  const calls: QueryCall[] = []
  const exists = options.exists ?? true
  const ownerId = options.ownerId ?? OWNER_ID
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (text.startsWith('WITH t AS (\n       UPDATE tracks')) {
        if (!exists || params?.at(-1) !== ownerId) return { rows: [] }
        return {
          rows: [
            {
              ...track(ownerId),
              title: (params?.[0] as string) ?? 'Original title',
              description: (params?.[1] as string) ?? 'Original description',
            },
          ],
        }
      }
      if (text.startsWith('DELETE FROM tracks')) {
        if (!exists || params?.[1] !== ownerId) return { rows: [] }
        return { rows: [{ object_key: `tracks/${TRACK_ID}` }] }
      }
      if (text.includes('WHERE t.id = $1')) {
        return { rows: exists && params?.[0] === TRACK_ID ? [track(ownerId)] : [] }
      }
      return { rows: [] }
    },
  }
}

function fakeStorage(shouldFail = false) {
  const deletes: string[] = []
  return {
    deletes,
    storage: {
      deleteObject: async (key: string) => {
        deletes.push(key)
        if (shouldFail) throw new Error('storage unavailable')
      },
    } as Storage,
  }
}

async function setup(options: {
  ownerId?: string
  exists?: boolean
  storageFails?: boolean
} = {}) {
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  const db = fakeDb(options)
  const storage = fakeStorage(options.storageFails)
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  fastify.decorate('storage', storage.storage)
  await fastify.register(updateTrack)
  await fastify.register(deleteTrack)
  const auth = (sub = OWNER_ID) => ({
    authorization: `Bearer ${fastify.jwt.sign({ sub, role: 'user' })}`,
  })
  return { fastify, db, storage, auth }
}

test('PATCH /api/tracks/:id lets the owner edit and returns a public track', async () => {
  const app = await setup()
  const res = await app.fastify.inject({
    method: 'PATCH',
    url: `/api/tracks/${TRACK_ID}`,
    headers: app.auth(),
    payload: { title: ' New title ' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().title, 'New title')
  assert.strictEqual(res.json().owner.displayName, 'Owner')
  assert.ok(!('objectKey' in res.json()))
  assert.deepStrictEqual(app.db.calls[0].params, ['New title', TRACK_ID, OWNER_ID])
  await app.fastify.close()
})

test('PATCH uses the token owner and distinguishes unauthenticated, forbidden, and missing tracks', async () => {
  const loggedOut = await setup()
  const noAuth = await loggedOut.fastify.inject({
    method: 'PATCH', url: `/api/tracks/${TRACK_ID}`, payload: { title: 'New title' },
  })
  assert.strictEqual(noAuth.statusCode, 401)
  await loggedOut.fastify.close()

  const forbidden = await setup()
  const forbiddenRes = await forbidden.fastify.inject({
    method: 'PATCH', url: `/api/tracks/${TRACK_ID}`, headers: forbidden.auth(OTHER_ID), payload: { title: 'New title', ownerId: OWNER_ID },
  })
  assert.strictEqual(forbiddenRes.statusCode, 400)
  const correctForbidden = await forbidden.fastify.inject({
    method: 'PATCH', url: `/api/tracks/${TRACK_ID}`, headers: forbidden.auth(OTHER_ID), payload: { title: 'New title' },
  })
  assert.strictEqual(correctForbidden.statusCode, 403)
  assert.deepStrictEqual(forbidden.db.calls[0].params, ['New title', TRACK_ID, OTHER_ID])
  await forbidden.fastify.close()

  const missing = await setup({ exists: false })
  const missingRes = await missing.fastify.inject({
    method: 'PATCH', url: `/api/tracks/${MISSING_ID}`, headers: missing.auth(), payload: { title: 'New title' },
  })
  assert.strictEqual(missingRes.statusCode, 404)
  await missing.fastify.close()
})

test('PATCH rejects invalid ids, fields, empty bodies, and invalid titles', async () => {
  const app = await setup()
  const requests = [
    { url: '/api/tracks/nope', payload: { title: 'New title' } },
    { url: `/api/tracks/${TRACK_ID}`, payload: { ownerId: OWNER_ID } },
    { url: `/api/tracks/${TRACK_ID}`, payload: {} },
    { url: `/api/tracks/${TRACK_ID}`, payload: { title: '   ' } },
    { url: `/api/tracks/${TRACK_ID}`, payload: { title: 'a'.repeat(101) } },
  ]
  for (const request of requests) {
    const res = await app.fastify.inject({ method: 'PATCH', headers: app.auth(), ...request })
    assert.strictEqual(res.statusCode, 400)
  }
  await app.fastify.close()
})

test('DELETE removes the owner row then its object using the token owner', async () => {
  const app = await setup()
  const res = await app.fastify.inject({
    method: 'DELETE', url: `/api/tracks/${TRACK_ID}`, headers: app.auth(),
  })
  assert.strictEqual(res.statusCode, 204)
  assert.deepStrictEqual(app.db.calls[0].params, [TRACK_ID, OWNER_ID])
  assert.deepStrictEqual(app.storage.deletes, [`tracks/${TRACK_ID}`])
  await app.fastify.close()
})

test('DELETE returns 403 or 404 without deleting an object and survives storage failures', async () => {
  const forbidden = await setup()
  const forbiddenRes = await forbidden.fastify.inject({
    method: 'DELETE', url: `/api/tracks/${TRACK_ID}`, headers: forbidden.auth(OTHER_ID),
  })
  assert.strictEqual(forbiddenRes.statusCode, 403)
  assert.deepStrictEqual(forbidden.storage.deletes, [])
  await forbidden.fastify.close()

  const missing = await setup({ exists: false })
  const missingRes = await missing.fastify.inject({
    method: 'DELETE', url: `/api/tracks/${MISSING_ID}`, headers: missing.auth(),
  })
  assert.strictEqual(missingRes.statusCode, 404)
  assert.deepStrictEqual(missing.storage.deletes, [])
  await missing.fastify.close()

  const storageFails = await setup({ storageFails: true })
  const failedDelete = await storageFails.fastify.inject({
    method: 'DELETE', url: `/api/tracks/${TRACK_ID}`, headers: storageFails.auth(),
  })
  assert.strictEqual(failedDelete.statusCode, 204)
  assert.deepStrictEqual(storageFails.storage.deletes, [`tracks/${TRACK_ID}`])
  await storageFails.fastify.close()
})
