# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
# Uses Bun because the project is Bun-based (bun.lockb / bunfig.toml).
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json bun.lockb bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and build.
# VITE_* env vars are read from the committed .env at build time and inlined
# into the client bundle (they are public Supabase anon values).
COPY . .
RUN bun run build

# ---------- Stage 2: runtime ----------
FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# The server bundle externalizes node_modules, so they are required at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY server.mjs ./server.mjs

EXPOSE 3000

# Server-side secrets (set these in EasyPanel -> Environment):
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   SUPABASE_PUBLISHABLE_KEY
CMD ["bun", "server.mjs"]
