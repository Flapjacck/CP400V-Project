import assert from 'node:assert'
import { test } from 'node:test'
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimitPlugin from '../../src/plugins/rate-limit.js'
import playTrack from '../../src/routes/tracks/play.js'

const TRACK_ID = '11111111-1111-1111-1111-111111111111'
const UNKNOWN_ID = '22222222-2222-2222-2222-222222222222'

type QueryCall = { text: string; params?: unknown[] }

function createFakeDb() {
  const calls: QueryCall[] = []
  let playCount = 0
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (
        text.includes('UPDATE tracks') &&
        text.includes('SET play_count = play_count + 1') &&
        params?.[0] === TRACK_ID
      ) {
        playCount += 1
        return { rows: [{ play_count: String(playCount) }] }
      }
      return { rows: [] }
    },
  }
}

async function setup(): Promise<{
  fastify: FastifyInstance
  db: ReturnType<typeof createFakeDb>
}> {
  const db = createFakeDb()
  const fastify = Fastify({ logger: false })
  fastify.decorate('db', db as never)
  await fastify.register(rateLimitPlugin)
  await fastify.register(playTrack)
  return { fastify, db }
}

test('POST /api/tracks/:id/play increments the count without a request body', async () => {
  const { fastify } = await setup()
  const first = await fastify.inject({
    method: 'POST',
    url: `/api/tracks/${TRACK_ID}/play`,
  })
  assert.strictEqual(first.statusCode, 200)
  assert.deepStrictEqual(first.json(), { playCount: 1 })

  const second = await fastify.inject({
    method: 'POST',
    url: `/api/tracks/${TRACK_ID}/play`,
  })
  assert.strictEqual(second.statusCode, 200)
  assert.deepStrictEqual(second.json(), { playCount: 2 })
  await fastify.close()
})

test('POST /api/tracks/:id/play returns 404 for missing tracks and 400 before querying bad ids', async () => {
  const { fastify, db } = await setup()
  const missing = await fastify.inject({
    method: 'POST',
    url: `/api/tracks/${UNKNOWN_ID}/play`,
  })
  assert.strictEqual(missing.statusCode, 404)
  assert.deepStrictEqual(missing.json(), { error: 'Not Found' })
  assert.strictEqual(db.calls.length, 1)

  const invalid = await fastify.inject({
    method: 'POST',
    url: '/api/tracks/not-an-id/play',
  })
  assert.strictEqual(invalid.statusCode, 400)
  assert.strictEqual(db.calls.length, 1)
  await fastify.close()
})

test('POST /api/tracks/:id/play limits one IP to 30 calls per minute', async () => {
  const { fastify, db } = await setup()
  for (let i = 0; i < 30; i++) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/api/tracks/${TRACK_ID}/play`,
    })
    assert.strictEqual(response.statusCode, 200, `attempt ${i + 1}`)
  }
  const limited = await fastify.inject({
    method: 'POST',
    url: `/api/tracks/${TRACK_ID}/play`,
  })
  assert.strictEqual(limited.statusCode, 429)
  assert.strictEqual(db.calls.length, 30)
  await fastify.close()
})

test('POST /api/tracks/:id/play only updates the play count', async () => {
  const { fastify, db } = await setup()
  await fastify.inject({
    method: 'POST',
    url: `/api/tracks/${TRACK_ID}/play`,
  })
  assert.match(db.calls[0].text, /play_count = play_count \+ 1/)
  assert.doesNotMatch(db.calls[0].text, /updated_at/)
  await fastify.close()
})
