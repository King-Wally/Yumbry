# syntax=docker/dockerfile:1

# ---- full install (dev deps included) shared by every build stage below ----
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci

FROM deps AS shared-build
COPY shared/tsconfig.json shared/tsconfig.build.json ./shared/
COPY shared/src ./shared/src
RUN npm run build --workspace=shared

FROM deps AS frontend-build
COPY --from=shared-build /repo/shared/dist ./shared/dist
COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

FROM deps AS backend-build
COPY --from=shared-build /repo/shared/dist ./shared/dist
COPY backend/tsconfig.json backend/tsconfig.build.json backend/prisma.config.ts ./backend/
COPY backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate
COPY backend/src ./backend/src
RUN npm run build --workspace=backend

# ---- production-only install: `npm ci --workspace=backend` installs most of
# backend's own deps (express, prisma, etc.) straight into backend/node_modules
# rather than hoisting them to the repo root, but hoists a handful of shared
# transitive deps (plus the yumbry-shared workspace link) to the root
# node_modules instead — which one happens per-package isn't something to
# hand-reason about, so the runtime stage below carries BOTH locations
# forward, nested exactly as npm left them, and lets Node's normal node_modules
# walk-up resolution sort out which one actually has each package. ----
FROM node:24-alpine AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --omit=dev --workspace=backend
COPY --from=shared-build /repo/shared/dist ./shared/dist
# The root node_modules/yumbry-shared entry is a symlink to ../shared,
# which isn't carried into the runtime image — but backend/node_modules is
# checked first by Node's resolution (it's the closer ancestor to backend's
# own compiled code) so a real, non-symlinked copy placed there is all that's
# actually needed; the dangling root symlink is simply never reached.
RUN rm -rf backend/node_modules/yumbry-shared \
  && mkdir -p backend/node_modules/yumbry-shared \
  && cp shared/package.json backend/node_modules/yumbry-shared/package.json \
  && cp -r shared/dist backend/node_modules/yumbry-shared/dist

# ---- runtime: /app mirrors the /repo monorepo shape (backend nested under
# it) rather than the old flattened single-package layout, since that's what
# npm workspaces' install output actually looks like — UPLOADS_DIR and
# docker-compose.yml's volume mount move one level deeper (/app/backend/uploads)
# to match; everything else about the running container is unchanged. ----
FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/backend/node_modules ./backend/node_modules
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/prisma ./backend/prisma
COPY --from=backend-build /repo/backend/dist ./backend/dist
COPY --from=frontend-build /repo/frontend/dist ./backend/public
COPY --chmod=755 backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/backend/uploads
EXPOSE 3000

WORKDIR /app/backend
RUN mkdir -p uploads && chown -R node:node /app
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
