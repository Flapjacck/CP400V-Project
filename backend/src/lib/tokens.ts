// Refresh tokens live in a cookie; Postgres only keeps a SHA-256 hash of the raw value.
import { createHash, randomBytes } from 'node:crypto'

export const REFRESH_TOKEN_TTL_DAYS = 7
export const REFRESH_COOKIE_NAME = 'refresh_token'

// Pool or transaction client — same query shape either way.
export interface Queryable {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

// Hex digest is what we store; the cookie still holds the raw random string.
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function saveRefreshToken(
  db: Queryable,
  userId: string,
  raw: string
): Promise<void> {
  const tokenHash = hashToken(raw)
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [userId, tokenHash]
  )
}

export async function findValidRefreshToken(
  db: Queryable,
  raw: string
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashToken(raw)
  const { rows } = await db.query(
    `SELECT id, user_id AS "userId"
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [tokenHash]
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return { id: String(row.id), userId: String(row.userId) }
}

export async function revokeRefreshToken(
  db: Queryable,
  raw: string
): Promise<void> {
  const tokenHash = hashToken(raw)
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
    [tokenHash]
  )
}

export function refreshCookieOptions(): {
  httpOnly: boolean
  sameSite: 'strict'
  path: string
  maxAge: number
  secure: boolean
} {
  const maxAge = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge,
    // Do not tie Secure to NODE_ENV; the image sets production even on localhost.
    secure: process.env.COOKIE_SECURE === 'true',
  }
}