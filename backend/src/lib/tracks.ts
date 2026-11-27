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
