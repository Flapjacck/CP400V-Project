import assert from 'node:assert'
import { test } from 'node:test'
import Fastify from 'fastify'
import getTrack from '../../src/routes/tracks/get.js'
import listTracks from '../../src/routes/tracks/list.js'
import listUserTracks from '../../src/routes/users/tracks.js'

const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TRACK_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
]

type QueryCall = { text: string; params?: unknown[] }

function track(id: string, ownerId = OWNER_ID) {
  return {
    id,
    owner_id: ownerId,
    title: `Track ${id[0]}`,
    description: 'Description',
    object_key: `tracks/${id}`,
    content_type: 'audio/mpeg',
    size_bytes: '42',
    play_count: '3',
    created_at: new Date(`2025-01-0${id[0]}T00:00:00Z`),
    updated_at: new Date('2025-01-10T00:00:00Z'),
    owner_display_name: ownerId === OWNER_ID ? 'Owner' : 'Other',
  }
}

function createFakeDb(options: { rows?: ReturnType<typeof track>[]; users?: string[]; cursorExists?: boolean } = {}) {
  const calls: QueryCall[] = []
  const rows = options.rows ?? TRACK_IDS.map((id) => track(id))
  const users = options.users ?? [OWNER_ID]
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (text === 'SELECT id FROM tracks WHERE id = $1') {
        return { rows: options.cursorExists === false ? [] : [{ id: params?.[0] }] }
      }
      if (text.includes('FROM users WHERE id = $1')) {
        return users.includes(params?.[0] as string)
          ? { rows: [{ id: params?.[0], display_name: 'Owner', bio: '', created_at: new Date() }] }
          : { rows: [] }
      }
      if (text.includes('WHERE t.id = $1')) {
        return { rows: rows.filter((row) => row.id === params?.[0]) }
      }
      if (text.includes('FROM tracks t JOIN users')) return { rows }
      return { rows: [] }
    },
  }
}

async function setup(options: Parameters<typeof createFakeDb>[0] = {}) {
  const db = createFakeDb(options)
  const fastify = Fastify({ logger: false })
  fastify.decorate('db', db as never)
  await fastify.register(getTrack)
  await fastify.register(listTracks)
  await fastify.register(listUserTracks)
  return { fastify, db }
}

test('GET /api/tracks/:id returns a public track, invalid ids are 400, and missing tracks are 404', async () => {
  const app = await setup()
  const ok = await app.fastify.inject({ method: 'GET', url: `/api/tracks/${TRACK_IDS[0]}` })
  assert.strictEqual(ok.statusCode, 200)
  assert.strictEqual(ok.json().owner.displayName, 'Owner')
  assert.ok(!('objectKey' in ok.json()))
  assert.ok(!('object_key' in ok.json()))
  const invalid = await app.fastify.inject({ method: 'GET', url: '/api/tracks/nope' })
  assert.strictEqual(invalid.statusCode, 400)
  const missing = await app.fastify.inject({ method: 'GET', url: `/api/tracks/${OTHER_ID}` })
  assert.strictEqual(missing.statusCode, 404)
  await app.fastify.close()
})

test('GET /api/tracks pages newest rows without leaking object keys', async () => {
  const app = await setup({ rows: TRACK_IDS.map((id) => track(id)) })
  const res = await app.fastify.inject({ method: 'GET', url: `/api/tracks?limit=2&before=${TRACK_IDS[0]}` })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().tracks.length, 2)
  assert.strictEqual(res.json().nextBefore, TRACK_IDS[1])
  assert.ok(!JSON.stringify(res.json()).includes('object_key'))
  assert.ok(!JSON.stringify(res.json()).includes('objectKey'))
  assert.deepStrictEqual(app.db.calls[0].params, [TRACK_IDS[0]])
  assert.deepStrictEqual(app.db.calls[1].params, [TRACK_IDS[0], 3])
  await app.fastify.close()
})

test('GET /api/tracks has no next cursor for a short page and rejects bad paging', async () => {
  const short = await setup({ rows: [track(TRACK_IDS[0])] })
  const shortRes = await short.fastify.inject({ method: 'GET', url: '/api/tracks?limit=2' })
  assert.deepStrictEqual(shortRes.json().nextBefore, null)
  await short.fastify.close()

  const app = await setup({ cursorExists: false })
  for (const url of ['/api/tracks?limit=0', '/api/tracks?limit=51', '/api/tracks?before=nope', `/api/tracks?before=${TRACK_IDS[0]}`]) {
    const res = await app.fastify.inject({ method: 'GET', url })
    assert.strictEqual(res.statusCode, 400)
  }
  await app.fastify.close()
})

test('GET /api/users/:id/tracks distinguishes unknown users from an empty list and filters by owner', async () => {
  const unknown = await setup({ users: [] })
  const unknownRes = await unknown.fastify.inject({ method: 'GET', url: `/api/users/${OWNER_ID}/tracks` })
  assert.strictEqual(unknownRes.statusCode, 404)
  await unknown.fastify.close()

  const app = await setup({ rows: [track(TRACK_IDS[0], OWNER_ID)], users: [OWNER_ID] })
  const res = await app.fastify.inject({ method: 'GET', url: `/api/users/${OWNER_ID}/tracks` })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(app.db.calls.at(-1)?.text.includes('t.owner_id = $1'))
  assert.deepStrictEqual(app.db.calls.at(-1)?.params, [OWNER_ID, 21])
  await app.fastify.close()

  const empty = await setup({ rows: [], users: [OWNER_ID] })
  const emptyRes = await empty.fastify.inject({ method: 'GET', url: `/api/users/${OWNER_ID}/tracks` })
  assert.deepStrictEqual(emptyRes.json(), { tracks: [], nextBefore: null })
  await empty.fastify.close()
})
