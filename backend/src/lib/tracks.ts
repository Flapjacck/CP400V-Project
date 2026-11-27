import type { Queryable } from './db.js'

export type TrackRow = {
  id: string
  owner_id: string
  title: string
  description: string
  object_key: string
  content_type: string
  size_bytes: string
  play_count: string
  created_at: Date
  updated_at: Date
  owner_display_name: string
}

// Shared reads keep the public track fields and owner name consistent.
export const TRACK_SELECT = `
  t.id, t.owner_id, t.title, t.description, t.object_key,
  t.content_type, t.size_bytes, t.play_count, t.created_at, t.updated_at,
  u.display_name AS owner_display_name
`

export const trackSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    contentType: { type: 'string' },
    sizeBytes: { type: 'number' },
    playCount: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    owner: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        displayName: { type: 'string' },
      },
    },
  },
} as const

export const trackPageSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tracks: { type: 'array', items: trackSchema },
    nextBefore: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const

export const trackPageQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    before: { type: 'string', format: 'uuid' },
  },
} as const

export function toTrackJson(row: TrackRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    playCount: Number(row.play_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    owner: {
      id: row.owner_id,
      displayName: row.owner_display_name,
    },
  }
}

export async function findTrackById(
  db: Queryable,
  id: string
): Promise<TrackRow | null> {
  const { rows } = await db.query(
    `SELECT ${TRACK_SELECT}
     FROM tracks t JOIN users u ON u.id = t.owner_id
     WHERE t.id = $1`,
    [id]
  )
  return (rows[0] as TrackRow | undefined) ?? null
}

type TrackPageOptions = { limit: number; before?: string }
type TrackPage = { rows: TrackRow[]; nextBefore: string | null }

async function listTracks(
  db: Queryable,
  options: TrackPageOptions,
  ownerId?: string
): Promise<TrackPage> {
  if (options.before) {
    const { rows } = await db.query('SELECT id FROM tracks WHERE id = $1', [
      options.before,
    ])
    if (rows.length === 0) throw new Error('Unknown track cursor')
  }

  const params: unknown[] = []
  const conditions: string[] = []
  if (ownerId) {
    params.push(ownerId)
    conditions.push(`t.owner_id = $${params.length}`)
  }
  if (options.before) {
    params.push(options.before)
    // Keep the cursor lookup in Postgres to preserve microseconds and break ties.
    conditions.push(
      `(t.created_at, t.id) < (SELECT created_at, id FROM tracks WHERE id = $${params.length})`
    )
  }
  params.push(options.limit + 1)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(
    `SELECT ${TRACK_SELECT}
     FROM tracks t JOIN users u ON u.id = t.owner_id
     ${where}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $${params.length}`,
    params
  )
  const trackRows = rows as TrackRow[]
  // Fetch one extra row to tell callers whether another page exists.
  const hasMore = trackRows.length > options.limit
  const pageRows = hasMore ? trackRows.slice(0, options.limit) : trackRows
  return {
    rows: pageRows,
    nextBefore: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
  }
}

export function listRecentTracks(
  db: Queryable,
  options: TrackPageOptions
): Promise<TrackPage> {
  return listTracks(db, options)
}

export function listTracksByOwner(
  db: Queryable,
  ownerId: string,
  options: TrackPageOptions
): Promise<TrackPage> {
  return listTracks(db, options, ownerId)
}

type NewTrack = {
  id: string
  ownerId: string
  title: string
  description: string
  objectKey: string
  contentType: string
  sizeBytes: number
}

export async function insertTrack(
  db: Queryable,
  track: NewTrack
): Promise<TrackRow> {
  const { rows } = await db.query(
    `WITH t AS (
       INSERT INTO tracks (id, owner_id, title, description, object_key, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *
     )
     SELECT t.*, u.display_name AS owner_display_name
     FROM t JOIN users u ON u.id = t.owner_id`,
    [
      track.id,
      track.ownerId,
      track.title,
      track.description,
      track.objectKey,
      track.contentType,
      track.sizeBytes,
    ]
  )
  return rows[0] as TrackRow
}
