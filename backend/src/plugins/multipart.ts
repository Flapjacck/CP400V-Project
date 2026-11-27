import multipart from '@fastify/multipart'
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { MAX_TRACK_BYTES } from '../lib/audio.js'

type MultipartPluginOptions = {
  limits?: { fileSize?: number }
}

const multipartPlugin: FastifyPluginAsync<MultipartPluginOptions> = async (
  fastify,
  options
) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: options.limits?.fileSize ?? MAX_TRACK_BYTES,
      files: 1,
      fields: 5,
      fieldSize: 4096,
    },
  })
}

export default fp(multipartPlugin)
