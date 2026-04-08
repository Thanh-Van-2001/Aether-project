# ═══════════════════════════════════════
#  Aether — Dockerfile
#  Multi-stage build for production
# ═══════════════════════════════════════

# ── Stage 1: Build ──
FROM node:22-slim AS builder
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# ── Stage 2: Production ──
FROM node:22-slim
WORKDIR /app

# Runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy built node_modules and source
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Create workspace directories
RUN mkdir -p workspace/memory workspace/skills workspace/logs

# Don't run as root
RUN groupadd -r aether && useradd -r -g aether aether
RUN chown -R aether:aether /app
USER aether

# Gateway port
EXPOSE 18789

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:18789/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# Default: start gateway
CMD ["node", "bin/aether.js", "gateway"]
