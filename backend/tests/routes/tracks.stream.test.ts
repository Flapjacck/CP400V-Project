import assert from 'node:assert'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import Fastify from 'fastify'
import type { Storage } from '../../src/lib/storage.js'
import {
  contentDispositionFilename,
  parseRange,
} from '../../src/lib/streaming.js'
import downloadTrack from '../../src/routes/tracks/download.js'
import streamTrack from '../../src/routes/tracks/stream.js'

const TRACK_ID = '11111111-1111-1111-1111-111111111111'
const MISSING_ID = '22222222-2222-2222-2222-222222222222'
const payload = Buffer.alloc(1000, 7)

function track(id = TRACK_ID) {
  return {
    id,
    owner_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'My Song!',
    description: 'Description',
    object_key: `tracks/${id}`,
    content_type: 'audio/mpeg',
    size_bytes: '1000',
    play_count: '0',
    created_at: new Date(),
    updated_at: new Date(),
    owner_display_name: 'Owner',
  }
}

function createFakeDb(includeTrack = true) {
  return {
    query: async (_text: string, params?: unknown[]) => ({
      rows: includeTrack && params?.[0] === TRACK_ID ? [track()] : [],
    }),
  }
}

function createFakeStorage(missingObject = false) {
  const calls: Array<{ key: string; range?: string }> = []
  const storage = {
    getObjectStream: async (key: string, range?: string) => {
      calls.push({ key, range })
      if (missingObject) {
        const error = new Error('missing')
        error.name = 'NoSuchKey'
        throw error
      }
      const [, startText, endText] = /^bytes=(\d+)-(\d+)$/.exec(range ?? '') ?? []
      const start = startText ? Number(startText) : 0
      const end = endText ? Number(endText) : payload.length - 1
      const body = payload.subarray(start, end + 1)
      return {
        stream: Readable.from(body),
        contentType: 'application/octet-stream',
        contentLength: body.length,
        contentRange: range,
      }
    },
  }
  return { storage: storage as Pick<Storage, 'getObjectStream'>, calls }
}

async function setup(options: { includeTrack?: boolean; missingObject?: boolean } = {}) {
  const fastify = Fastify({ logger: false })
  const db = createFakeDb(options.includeTrack)
  const fakeStorage = createFakeStorage(options.missingObject)
  fastify.decorate('db', db as never)
  fastify.decorate('storage', fakeStorage.storage as never)
  await fastify.register(streamTrack)
  await fastify.register(downloadTrack)
  return { fastify, storage: fakeStorage }
}

test('stream returns the whole public track without a Range header', async () => {
  const app = await setup()
  const response = await app.fastify.inject({ method: 'GET', url: `/api/tracks/${TRACK_ID}/stream` })
  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.rawPayload.length, 1000)
  assert.strictEqual(response.headers['accept-ranges'], 'bytes')
  assert.strictEqual(response.headers['content-type'], 'audio/mpeg')
  assert.strictEqual(response.headers['content-disposition'], undefined)
  assert.deepStrictEqual(app.storage.calls, [{ key: `tracks/${TRACK_ID}`, range: undefined }])
  await app.fastify.close()
})

test('stream forwards explicit, open-ended, suffix, and clamped ranges', async () => {
  const app = await setup()
  const cases = [
    ['bytes=0-99', 'bytes 0-99/1000', 100, 'bytes=0-99'],
    ['bytes=900-', 'bytes 900-999/1000', 100, 'bytes=900-999'],
    ['bytes=-100', 'bytes 900-999/1000', 100, 'bytes=900-999'],
    ['bytes=0-5000', 'bytes 0-999/1000', 1000, 'bytes=0-999'],
  ] as const
  for (const [range, contentRange, length, storageRange] of cases) {
    const response = await app.fastify.inject({
      method: 'GET', url: `/api/tracks/${TRACK_ID}/stream`, headers: { range },
    })
    assert.strictEqual(response.statusCode, 206)
    assert.strictEqual(response.headers['content-range'], contentRange)
    assert.strictEqual(response.rawPayload.length, length)
    assert.strictEqual(app.storage.calls.at(-1)?.range, storageRange)
  }
  await app.fastify.close()
})

test('stream rejects invalid ranges without asking storage', async () => {
  const app = await setup()
  for (const range of ['bytes=1000-', 'bytes=abc', 'bytes=0-1,5-9']) {
    const response = await app.fastify.inject({
      method: 'GET', url: `/api/tracks/${TRACK_ID}/stream`, headers: { range },
    })
    assert.strictEqual(response.statusCode, 416)
    assert.strictEqual(response.headers['accept-ranges'], 'bytes')
    assert.strictEqual(response.headers['content-range'], 'bytes */1000')
  }
  assert.deepStrictEqual(app.storage.calls, [])
  await app.fastify.close()
})

test('stream returns 400 for bad ids, 404 for missing tracks and objects', async () => {
  const app = await setup()
  const invalid = await app.fastify.inject({ method: 'GET', url: '/api/tracks/nope/stream' })
  assert.strictEqual(invalid.statusCode, 400)
  await app.fastify.close()

  const missing = await setup({ includeTrack: false })
  const missingTrack = await missing.fastify.inject({ method: 'GET', url: `/api/tracks/${MISSING_ID}/stream` })
  assert.strictEqual(missingTrack.statusCode, 404)
  await missing.fastify.close()

  const object = await setup({ missingObject: true })
  const missingObject = await object.fastify.inject({ method: 'GET', url: `/api/tracks/${TRACK_ID}/stream` })
  assert.strictEqual(missingObject.statusCode, 404)
  await object.fastify.close()
})

test('download adds a safe filename and preserves Range support', async () => {
  const app = await setup()
  const download = await app.fastify.inject({ method: 'GET', url: `/api/tracks/${TRACK_ID}/download` })
  assert.strictEqual(download.statusCode, 200)
  assert.strictEqual(download.headers['content-disposition'], 'attachment; filename="my-song.mp3"')
  const partial = await app.fastify.inject({
    method: 'GET', url: `/api/tracks/${TRACK_ID}/download`, headers: { range: 'bytes=0-99' },
  })
  assert.strictEqual(partial.statusCode, 206)
  await app.fastify.close()
})

test('parseRange accepts supported single ranges and rejects unsupported ones', () => {
  assert.deepStrictEqual(parseRange(undefined, 1000), { kind: 'full' })
  assert.deepStrictEqual(parseRange('bytes=1-2', 1000), { kind: 'partial', start: 1, end: 2 })
  assert.deepStrictEqual(parseRange('bytes=-100', 1000), { kind: 'partial', start: 900, end: 999 })
  assert.deepStrictEqual(parseRange('bytes=0-5000', 1000), { kind: 'partial', start: 0, end: 999 })
  for (const header of ['bytes=0-1,5-9', 'bytes=2-1', 'bytes=-0', 'bytes=0-']) {
    assert.deepStrictEqual(parseRange(header, 0), { kind: 'invalid' })
  }
})

test('contentDispositionFilename normalizes titles and chooses known extensions', () => {
  assert.strictEqual(contentDispositionFilename('My Song!', 'audio/mpeg'), 'my-song.mp3')
  assert.strictEqual(contentDispositionFilename('!!!', 'audio/unknown'), 'track')
})
