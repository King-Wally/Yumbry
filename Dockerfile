# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json backend/prisma.config.ts ./
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
# schema.prisma + migrations + prisma.config.ts aren't imported by the
# compiled server (that's dist/generated/prisma, already baked into
# dist/ from backend-build) — they're only here for docker-entrypoint.sh's
# `prisma migrate deploy` CLI invocation at container start.
COPY backend/prisma.config.ts ./
COPY backend/prisma ./prisma
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /frontend/dist ./public
COPY --chmod=755 backend/docker-entrypoint.sh ./

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/uploads
EXPOSE 3000

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
