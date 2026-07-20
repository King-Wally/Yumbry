#!/bin/sh
set -e

node_modules/.bin/node-pg-migrate up -j sql --config-file .node-pg-migrate.json

exec node dist/index.js
