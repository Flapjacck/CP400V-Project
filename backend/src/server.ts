import Fastify from 'fastify'
import app from './app.js'

const port = parseInt(process.env.PORT || '3000', 10)
const host = process.env.HOST || '0.0.0.0'

const server = Fastify({
  logger: true
})

server.register(app)

server.listen({ port, host }, (err, address) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
  console.log(`Server listening at ${address}`)
})
