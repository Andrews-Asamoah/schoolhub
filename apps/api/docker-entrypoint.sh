#!/bin/sh
# Tells the super-admin operations report which migration this build expects,
# so it can flag a database that is behind (or ahead of) the running code.
set -e
if [ -z "$EXPECTED_MIGRATION_NAME" ] && [ -d prisma/migrations ]; then
  EXPECTED_MIGRATION_NAME="$(ls prisma/migrations | grep -E '^[0-9]' | sort | tail -n 1)"
  export EXPECTED_MIGRATION_NAME
fi
exec "$@"
