import { randomUUID } from 'node:crypto'
import { pipeline, Readable, Transform } from 'node:stream'
import type { FastifyPluginAsync } from 'fastify'
import { fileTypeStream } from 'file-type'
import {
  ACCEPTED_CLIENT_AUDIO_TYPES,
  DETECTED_AUDIO_TYPES,
} from '../../lib/audio.js'
import { errorSchema } from '../../lib/schemas.js'
import {
  cleanTrackFields,
  insertTrack,
  toTrackJson,
  trackSchema,
} from '../../lib/tracks.js'

function textField(
  fields: Record<string, unknown>,
  name: string
): string | undefined {
  const field = fields[name]
  if (!field || Array.isArray(field) || typeof field !== 'object') return undefined
  const value = (field as { value?: unknown }).value
  return typeof value === 'string' ? value : undefined
}

async function deleteAfterFailure(
  fastify: Parameters<FastifyPluginAsync>[0],
  key: string
): Promise<void> {
  try {
    await fastify.storage.deleteObject(key)
  } catch (err) {
    fastify.log.warn({ err, key }, 'track upload cleanup failed')
  }
}

const createTrack: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/tracks',
    {
      preHandler: fastify.authenticate,
      schema: {
        response: {
          201: trackSchema,
          400: errorSchema,
          401: errorSchema,
          413: errorSchema,
          415: errorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({ error: 'Bad Request' })
      }

      let file
      try {
        file = await request.file()
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'Payload Too Large' })
        }
        throw err
      }
      if (!file || file.fieldname !== 'file') {
        return reply.code(400).send({ error: 'Bad Request' })
      }

      const fields = file.fields as Record<string, unknown>
      const cleanedFields = cleanTrackFields({
        title: textField(fields, 'title'),
        description: textField(fields, 'description') ?? '',
      })
      const badFields = Object.keys(fields).some(
        // multipart includes the current file in fields as well as prior text parts.
        (name) => name !== 'title' && name !== 'description' && name !== 'file'
      )
      if (
        badFields ||
        !cleanedFields ||
        !cleanedFields.title
      ) {
        file.file.resume()
        return reply.code(400).send({ error: 'Bad Request' })
      }
      const { title, description } = cleanedFields
      if (!(ACCEPTED_CLIENT_AUDIO_TYPES as readonly string[]).includes(file.mimetype)) {
        file.file.resume()
        return reply.code(415).send({ error: 'Unsupported Media Type' })
      }

      // Check magic bytes before writing an object, not the user-controlled MIME header.
      const detectedStream = await fileTypeStream(Readable.toWeb(file.file))
      const contentType = detectedStream.fileType
        ? DETECTED_AUDIO_TYPES[detectedStream.fileType.ext]
        : undefined
      if (!contentType) {
        await Readable.fromWeb(detectedStream).resume()
        return reply.code(415).send({ error: 'Unsupported Media Type' })
      }

      const trackId = randomUUID()
      const key = `tracks/${trackId}`
      let sizeBytes = 0
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          sizeBytes += chunk.length
          callback(null, chunk)
        },
      })

      try {
        // Store the detected type while the upload remains a stream end to end.
        await fastify.storage.uploadObject(
          key,
          // Pipeline must reach the upload with source errors or an abort crashes the process.
          pipeline(Readable.fromWeb(detectedStream), counter, () => {}),
          contentType
        )
        if (file.file.truncated) {
          await deleteAfterFailure(fastify, key)
          return reply.code(413).send({ error: 'Payload Too Large' })
        }
      } catch (err) {
        await deleteAfterFailure(fastify, key)
        if (
          file.file.truncated ||
          (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
        ) {
          return reply.code(413).send({ error: 'Payload Too Large' })
        }
        throw err
      }

      try {
        // The object must exist before the row; clean it up if SQL fails.
        const row = await insertTrack(fastify.db, {
          id: trackId,
          ownerId: request.user.sub,
          title: title!,
          description: description!,
          objectKey: key,
          contentType,
          sizeBytes,
        })
        return reply.code(201).send(toTrackJson(row))
      } catch (err) {
        await deleteAfterFailure(fastify, key)
        throw err
      }
    }
  )
}

export default createTrack
