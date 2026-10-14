# ==============================================================================
# SocietyFix AI — Production Multi-Stage Containerfile for Google Cloud Run
# ==============================================================================

# Stage 1: Build Frontend Assets and Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install build prerequisites
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json bun.lock ./

# Install all dependencies reproducibly
RUN npm ci

# Copy source code and configuration
COPY tsconfig.json vite.config.ts index.html metadata.json ./
COPY src/ ./src/

# Build production frontend static bundle into dist/
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production Distilled Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install production dependencies only
COPY package.json bun.lock ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend source files, configs, and migration definitions
COPY server.ts ./
COPY src/ ./src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY index.html ./
COPY metadata.json ./

# Security: Ensure process runs as non-root user
USER node

# Expose default HTTP port
EXPOSE 3000

# Cloud Run healthcheck (Docker native)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/ready || exit 1

# Start full-stack server using tsx
CMD ["node", "--import", "tsx", "server.ts"]
