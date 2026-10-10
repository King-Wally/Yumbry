# syntax=docker/dockerfile:1

# Debian slim (glibc): sharp's linux-x64/linux-arm64 prebuilds load as is, and the image is
# published for both architectures (production is arm64). Its `bun` user is uid/gid 1000, which
# owns the existing uploads volume.
ARG BUN_VERSION=1.4.2

# ---- all dependencies, for the build ----
# Pinned to the build host's architecture: the output in build/ is plain JS, and Vite/Rolldown's
# native bindings hang under QEMU when cross-building for arm64. Only prod-deps (sharp's prebuilt
# binary) and runtime run on the target platform.
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY e2e/package.json ./e2e/package.json
# `prepare` needs the sources; the build stage runs it.
RUN bun install --frozen-lockfile --ignore-scripts

# ---- runtime dependencies only: what adapter-node leaves external, plus migrate.ts's ----
FROM oven/bun:${BUN_VERSION}-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY e2e/package.json ./e2e/package.json
# --omit peer: better-auth's optional peers (vite, drizzle-kit, typescript, …) would otherwise be
# auto-installed and double the size.
RUN bun install --frozen-lockfile --production --ignore-scripts --omit peer

FROM --platform=$BUILDPLATFORM deps AS build
COPY . .
# Needs no environment: src/env.ts only insists on required variables when the server starts.
RUN bun run prepare && bun run build

# ---- runtime ----
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app

# BODY_SIZE_LIMIT leaves room for a 25 MB photo plus the rest of the multipart form.
# ADDRESS_HEADER/XFF_DEPTH take the client IP from the rightmost X-Forwarded-For entry: the hop
# the Cloudflare Tunnel adds. scripts/serve.ts owns the protocol and
# host (from ORIGIN), so PROTOCOL_HEADER and HOST_HEADER stay unset.
ENV NODE_ENV=production \
	PORT=3000 \
	BODY_SIZE_LIMIT=30M \
	UPLOADS_DIR=/app/uploads \
	ADDRESS_HEADER=x-forwarded-for \
	XFF_DEPTH=1

# Code stays root-owned; the app can only write to its uploads directory.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY scripts/migrate.ts scripts/serve.ts ./scripts/
RUN mkdir -p /app/uploads && chown bun:bun /app/uploads

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
	CMD ["bun", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Migrate on every start (idempotent, see scripts/migrate.ts), then hand PID 1 to the server.
CMD ["sh", "-c", "bun scripts/migrate.ts && exec bun scripts/serve.ts"]
