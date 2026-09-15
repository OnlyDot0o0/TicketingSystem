#!/bin/sh
set -e

# `prisma migrate deploy` (unlike `migrate dev`) only applies already-
# committed migration files and never prompts or generates new ones — safe
# to run unattended on every container start. For a multi-replica deploy
# where several containers could start at once, run migrations as a single
# one-off step instead (e.g. `docker run --rm -e DATABASE_URL=... <image>
# npx prisma migrate deploy`) and set SKIP_MIGRATIONS=true on the actual
# server replicas to skip this.
if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

exec node server.js
