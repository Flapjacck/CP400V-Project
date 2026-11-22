# Multi-stage Dockerfile for the Fastify backend
# Build stage: compile TypeScript and dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy all files
COPY . .

# Install dependencies (including dev dependencies for build)
RUN pnpm install --allow-build esbuild

# Build TypeScript
RUN pnpm build

# Production stage: minimal image with only runtime dependencies
FROM node:22-alpine

WORKDIR /app

# Install pnpm for production
RUN npm install -g pnpm

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package and lock files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --prod && pnpm store prune

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership of the application to the non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "import('http').then(({request}) => request('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}))"

# Expose port
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
