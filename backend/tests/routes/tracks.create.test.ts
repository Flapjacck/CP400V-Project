import assert from 'node:assert'
import { before, test } from 'node:test'
import { Readable } from 'node:stream'
import Fastify from 'fastify'
import type { Storage } from '../../src/lib/storage.js'
import authPlugin from '../../src/plugins/auth.js'
import multipartPlugin from '../../src/plugins/multipart.js'
import createTrack from '../../src/routes/tracks/create.js'

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const NOW = new Date('2025-01-01T00:00:00Z')
const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Buffer.alloc(32)])

before(() => {
  process.env.JWT_SECRET =
    'test-jwt-secret-at-least-32-characters-long-for-unit-tests'
})

function multipartBody(
  fields: Record<string, string>,
  file?: { name?: string; type?: string; body?: Buffer }
) {
  const boundary = '----track-test-boundary'
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    )
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name ?? 'song.mp3'}"\r\nContent-Type: ${file.type ?? 'audio/mpeg'}\r\n\r\n`
      ),
      file.body ?? MP3,
      Buffer.from('\r\n')
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

function fakeStorage() {
  const puts: { key: string; contentType: string; body: Buffer }[] = []
  const deletes: string[] = []
  return {
    puts,
    deletes,
    storage: {
      uploadObject: async (key, body, contentType) => {
        const chunks: Buffer[] = []
        for await (const chunk of body as Readable) chunks.push(Buffer.from(chunk))
        puts.push({ key, contentType, body: Buffer.concat(chunks) })
      },
      deleteObject: async (key) => {
        deletes.push(key)
      },
    } as Storage,
  }
}

function fakeDb(shouldFail = false) {
  const calls: { text: string; params?: unknown[] }[] = []
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (shouldFail) throw new Error('insert failed')
      return {
        rows: [
          {
            id: params?.[0],
            owner_id: params?.[1],
            title: params?.[2],
            description: params?.[3],
            object_key: params?.[4],
            content_type: params?.[5],
            size_bytes: String(params?.[6]),
            play_count: '0',
            created_at: NOW,
            updated_at: NOW,
            owner_display_name: 'Uploader',
          },
        ],
      }
    },
  }
}

async function setup(options: { limit?: number; failInsert?: boolean } = {}) {
  const fastify = Fastify({ logger: false })
  const db = fakeDb(options.failInsert)
  const storage = fakeStorage()
  await fastify.register(authPlugin)
  await fastify.register(multipartPlugin, {
    limits: { fileSize: options.limit ?? 50 * 1024 * 1024 },
  })
  fastify.decorate('db', db as never)
  fastify.decorate('storage', storage.storage)
  await fastify.register(createTrack)
  return {
    fastify,
    db,
    storage,
    auth: { authorization: `Bearer ${fastify.jwt.sign({ sub: USER_ID, role: 'user' })}` },
  }
}

async function post(
  setupResult: Awaited<ReturnType<typeof setup>>,
  fields: Record<string, string>,
  file: { name?: string; type?: string; body?: Buffer } | undefined = {}
) {
  const form = multipartBody(fields, file)
  return setupResult.fastify.inject({
    method: 'POST',
    url: '/api/tracks',
    headers: { ...setupResult.auth, 'content-type': form.contentType },
    payload: form.body,
  })
}

test('POST /api/tracks uploads detected MP3 and returns a public track', async () => {
  const app = await setup()
  const res = await post(app, { title: ' Song ', description: ' Description ' })
  assert.strictEqual(res.statusCode, 201)
  const body = res.json()
  assert.match(body.id, /^[0-9a-f-]{36}$/)
  assert.strictEqual(app.storage.puts[0].key, `tracks/${body.id}`)
  assert.strictEqual(body.title, 'Song')
  assert.strictEqual(body.contentType, 'audio/mpeg')
  assert.ok(!('objectKey' in body))
  await app.fastify.close()
})

test('POST /api/tracks rejects requests without a token before storage', async () => {
  const app = await setup()
  const form = multipartBody({ title: 'Song' })
  const res = await app.fastify.inject({
    method: 'POST',
    url: '/api/tracks',
    headers: { 'content-type': form.contentType },
    payload: form.body,
  })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(app.storage.puts.length, 0)
  await app.fastify.close()
})

test('POST /api/tracks rejects renamed text and unaccepted client MIME types', async () => {
  const renamed = await setup()
  const textRes = await post(renamed, { title: 'Song' }, {
    name: 'not-a-song.mp3',
    body: Buffer.from('plain text'),
  })
  assert.strictEqual(textRes.statusCode, 415)
  assert.strictEqual(renamed.storage.puts.length, 0)
  await renamed.fastify.close()

  const type = await setup()
  const typeRes = await post(type, { title: 'Song' }, { type: 'text/plain' })
  assert.strictEqual(typeRes.statusCode, 415)
  assert.strictEqual(type.storage.puts.length, 0)
  await type.fastify.close()
})

test('POST /api/tracks validates required title and title length', async () => {
  for (const title of ['', 'a'.repeat(101)]) {
    const app = await setup()
    const res = await post(app, { title })
    assert.strictEqual(res.statusCode, 400)
    assert.strictEqual(app.storage.puts.length, 0)
    await app.fastify.close()
  }
})

test('POST /api/tracks removes a partial object when it exceeds the limit', async () => {
  const app = await setup({ limit: 16 })
  const res = await post(app, { title: 'Song' }, { body: Buffer.concat([MP3, Buffer.alloc(64)]) })
  assert.strictEqual(res.statusCode, 413)
  assert.strictEqual(app.storage.puts.length, 1)
  assert.deepStrictEqual(app.storage.deletes, [app.storage.puts[0].key])
  await app.fastify.close()
})

test('POST /api/tracks removes an uploaded object after an insert failure', async () => {
  const app = await setup({ failInsert: true })
  const res = await post(app, { title: 'Song' })
  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(app.storage.puts.length, 1)
  assert.deepStrictEqual(app.storage.deletes, [app.storage.puts[0].key])
  await app.fastify.close()
})
