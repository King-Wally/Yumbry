# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /frontend/dist ./public
COPY backend/migrations ./migrations
COPY backend/.node-pg-migrate.json ./
COPY --chmod=755 backend/docker-entrypoint.sh ./

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/uploads
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
