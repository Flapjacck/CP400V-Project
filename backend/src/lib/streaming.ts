import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { DETECTED_AUDIO_TYPES } from './audio.js'
import { findTrackById } from './tracks.js'

export type ParsedRange =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'invalid' }

export function parseRange(header: string | undefined, size: number): ParsedRange {
  if (!header) return { kind: 'full' }
  if (size === 0 || header.includes(',')) return { kind: 'invalid' }

  // Parse the single supported HTTP range ourselves before touching storage.
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return { kind: 'invalid' }

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (suffixLength === 0) return { kind: 'invalid' }
    return {
      kind: 'partial',
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  const end = Math.min(requestedEnd, size - 1)
  if (start >= size || start > end) return { kind: 'invalid' }
  return { kind: 'partial', start, end }
}

export function contentDispositionFilename(
  title: string,
  contentType: string
): string {
  const basename =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 80)
      // Trim after the cap so a cut title cannot end in a dash.
      .replace(/^-+|-+$/g, '') || 'track'
  const extension = Object.entries(DETECTED_AUDIO_TYPES).find(
    ([, type]) => type === contentType
  )?.[0]
  return extension ? `${basename}.${extension}` : basename
}

type TrackFileRequest = FastifyRequest<{ Params: { id: string } }>

function isMissingObject(err: unknown): boolean {
  if (typeof err !== 'object' || !err) return false
  const error = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404
}

export async function sendTrackFile(
  fastify: FastifyInstance,
  request: TrackFileRequest,
  reply: FastifyReply,
  options: { attachment: boolean }
) {
  const row = await findTrackById(fastify.db, request.params.id)
  if (!row) return reply.code(404).send({ error: 'Not Found' })

  const size = Number(row.size_bytes)
  const parsedRange = parseRange(request.headers.range, size)
  if (parsedRange.kind === 'invalid') {
    // Reject unsatisfiable ranges before making an unnecessary object-store request.
    return reply
      .header('Accept-Ranges', 'bytes')
      .header('Content-Range', `bytes */${size}`)
      .code(416)
      .send({ error: 'Range Not Satisfiable' })
  }

  const range =
    parsedRange.kind === 'partial'
      ? `bytes=${parsedRange.start}-${parsedRange.end}`
      : undefined
  let object
  try {
    object = await fastify.storage.getObjectStream(row.object_key, range)
  } catch (err) {
    // A deleted object should look like the missing track it can no longer serve.
    if (isMissingObject(err)) {
      fastify.log.warn({ err, key: row.object_key }, 'track object not found')
      return reply.code(404).send({ error: 'Not Found' })
    }
    throw err
  }

  const computedLength =
    parsedRange.kind === 'partial' ? parsedRange.end - parsedRange.start + 1 : size
  reply
    .header('Accept-Ranges', 'bytes')
    // The database value is the sniffed type, unlike object-store metadata.
    .header('Content-Type', row.content_type)
    .header('Content-Length', object.contentLength ?? computedLength)

  if (parsedRange.kind === 'partial') {
    reply
      .header('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${size}`)
      .code(206)
  } else {
    reply.code(200)
  }
  if (options.attachment) {
    reply.header(
      'Content-Disposition',
      `attachment; filename="${contentDispositionFilename(row.title, row.content_type)}"`
    )
  }
  return reply.send(object.stream)
}
