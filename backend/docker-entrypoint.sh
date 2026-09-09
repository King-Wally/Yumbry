#!/bin/sh
set -e

npx --no-install prisma migrate deploy

exec node dist/index.js
