import Fastify from 'fastify'
import app from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const server = Fastify({
  logger: {
    // Auth routes must not land passwords or token values in container logs.
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'res.headers.set-cookie',
    ],
  },
  ajv: {
    // Fastify strips extra body keys by default; we want 400 on unknown fields.
    customOptions: { removeAdditional: false },
  },
})
server.register(app)

// Close cleanly when Docker stops the container
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close()
    process.exit(0)
  })
}

try {
  await server.listen({ port, host })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
