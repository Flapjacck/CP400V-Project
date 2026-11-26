import { test, before } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import authPlugin from '../../src/plugins/auth.js'
import changePassword from '../../src/routes/me/password.js'
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js'

before(() => {
  process.env.JWT_SECRET =
    'test-jwt-secret-at-least-32-characters-long-for-unit-tests'
})

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OLD_PASSWORD = 'oldpassword1'
const NEW_PASSWORD = 'newpassword2'

type QueryCall = { text: string; params?: unknown[] }

type FakeDbOptions = {
  exists?: boolean
  failRevoke?: boolean
}

function createFakeDb(passwordHash: string, options: FakeDbOptions = {}) {
  const { exists = true, failRevoke = false } = options
  const calls: QueryCall[] = []
  const clientCalls: QueryCall[] = []
  let connected = false
  let released = false
  let storedHash = passwordHash

  const client = {
    query: async (text: string, params?: unknown[]) => {
      clientCalls.push({ text, params })
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [] }
      }
      if (text.startsWith('UPDATE users SET password_hash')) {
        storedHash = params?.[0] as string
        return { rows: [] }
      }
      if (
        text.includes('UPDATE refresh_tokens') &&
        text.includes('user_id')
      ) {
        if (failRevoke) {
          throw new Error('revoke failed')
        }
        return { rows: [] }
      }
      return { rows: [] }
    },
    release: () => {
      released = true
    },
  }

  return {
    calls,
    clientCalls,
    get connected() {
      return connected
    },
    get released() {
      return released
    },
    get storedHash() {
      return storedHash
    },
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      if (text.includes('SELECT password_hash FROM users')) {
        if (!exists) return { rows: [] }
        return { rows: [{ password_hash: storedHash }] }
      }
      if (text.startsWith('INSERT INTO refresh_tokens')) {
        return { rows: [] }
      }
      return { rows: [] }
    },
    connect: async () => {
      connected = true
      return client
    },
  }
}

async function setup(options: FakeDbOptions = {}) {
  const passwordHash = await hashPassword(OLD_PASSWORD)
  const db = createFakeDb(passwordHash, options)
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await fastify.register(changePassword)
  const token = fastify.jwt.sign({ sub: USER_ID, role: 'user' })
  return {
    fastify,
    db,
    auth: { authorization: `Bearer ${token}` },
  }
}

const postPassword = (
  fastify: Awaited<ReturnType<typeof setup>>['fastify'],
  headers: Record<string, string> | undefined,
  payload: Record<string, unknown>
) =>
  fastify.inject({
    method: 'POST',
    url: '/api/me/password',
    headers,
    payload,
  })

const okBody = {
  currentPassword: OLD_PASSWORD,
  newPassword: NEW_PASSWORD,
}

test('POST /api/me/password without a token is 401', async () => {
  const { fastify } = await setup()
  const res = await postPassword(fastify, undefined, okBody)
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})

test('POST /api/me/password succeeds and revokes other sessions', async () => {
  const { fastify, db, auth } = await setup()
  const res = await postPassword(fastify, auth, okBody)
  assert.strictEqual(res.statusCode, 204)
  assert.strictEqual(res.body, '')

  const tx = db.clientCalls.map((c) => c.text)
  assert.deepStrictEqual(tx, [
    'BEGIN',
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    expectRevokeSql(),
    'COMMIT',
  ])
  assert.ok(db.released)

  assert.ok(await verifyPassword(NEW_PASSWORD, db.storedHash))
  assert.ok(!(await verifyPassword(OLD_PASSWORD, db.storedHash)))

  const inserts = db.calls.filter((c) =>
    c.text.startsWith('INSERT INTO refresh_tokens')
  )
  assert.strictEqual(inserts.length, 1)

  const cookie = res.headers['set-cookie']
  assert.ok(cookie)
  const header = Array.isArray(cookie) ? cookie.join('; ') : cookie
  assert.ok(header.includes('refresh_token'))
  assert.ok(header.includes('Path=/api/auth'))
  await fastify.close()
})

function expectRevokeSql() {
  return `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`
}

test('POST /api/me/password with wrong current password is 401 and writes nothing', async () => {
  const { fastify, db, auth } = await setup()
  const res = await postPassword(fastify, auth, {
    currentPassword: 'wrongpassword',
    newPassword: NEW_PASSWORD,
  })
  assert.strictEqual(res.statusCode, 401)
  assert.deepStrictEqual(res.json(), { error: 'Current password is incorrect' })
  assert.ok(!db.connected)
  assert.strictEqual(
    db.calls.filter((c) => c.text.startsWith('UPDATE')).length,
    0
  )
  assert.strictEqual(
    db.calls.filter((c) => c.text.startsWith('INSERT INTO refresh_tokens'))
      .length,
    0
  )
  assert.ok(!res.headers['set-cookie'])
  await fastify.close()
})

test('POST /api/me/password for a deleted user is 401 with no writes', async () => {
  const { fastify, db, auth } = await setup({ exists: false })
  const res = await postPassword(fastify, auth, okBody)
  assert.strictEqual(res.statusCode, 401)
  assert.deepStrictEqual(res.json(), { error: 'Unauthorized' })
  assert.ok(!db.connected)
  assert.strictEqual(
    db.calls.filter((c) => c.text.startsWith('UPDATE')).length,
    0
  )
  assert.ok(!res.headers['set-cookie'])
  await fastify.close()
})

test('POST /api/me/password rejects invalid newPassword and extra fields', async () => {
  const cases: Record<string, unknown>[] = [
    { currentPassword: OLD_PASSWORD, newPassword: 'short' },
    { currentPassword: OLD_PASSWORD, newPassword: 'a'.repeat(73) },
    { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, extra: true },
    { newPassword: NEW_PASSWORD },
  ]
  for (const payload of cases) {
    const { fastify, db, auth } = await setup()
    const res = await postPassword(fastify, auth, payload)
    assert.strictEqual(res.statusCode, 400, JSON.stringify(payload))
    assert.ok(!db.connected)
    await fastify.close()
  }
})

test('POST /api/me/password rolls back when revoke fails', async () => {
  const { fastify, db, auth } = await setup({ failRevoke: true })
  const res = await postPassword(fastify, auth, okBody)
  assert.strictEqual(res.statusCode, 500)
  assert.ok(db.clientCalls.some((c) => c.text === 'ROLLBACK'))
  assert.ok(db.released)
  await fastify.close()
})
