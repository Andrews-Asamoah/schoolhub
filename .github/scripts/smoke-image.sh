#!/usr/bin/env bash
set -euo pipefail
IMAGE=${1:?image required}
COMPONENT=${2:?component required}
case "$COMPONENT" in api|web) ;; *) exit 2 ;; esac
if [ "$COMPONENT" = api ]; then
  docker network create schoolhub-smoke
  docker run -d --name smoke-db --network schoolhub-smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=schoolhub_smoke postgres:17
  trap 'docker logs smoke-api 2>/dev/null || true; docker rm -f smoke-api smoke-db 2>/dev/null || true; docker network rm schoolhub-smoke 2>/dev/null || true' EXIT
  for attempt in $(seq 1 40); do
    if docker exec smoke-db pg_isready -U postgres -d schoolhub_smoke; then break; fi
    sleep 1
  done
  export DATABASE_URL=postgresql://postgres:smoke@smoke-db:5432/schoolhub_smoke
  docker run --rm --network schoolhub-smoke --env DATABASE_URL "$IMAGE" node node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts
  docker run -d --name smoke-api --network schoolhub-smoke -p 127.0.0.1:3001:3001 --env DATABASE_URL \
    -e BETTER_AUTH_SECRET=smoke-only-secret-0000000000000000000000 -e BETTER_AUTH_URL=https://api.school.test \
    -e WEB_ORIGIN=https://app.school.test -e FINANCE_INTEGRITY_JOB=off "$IMAGE"
  curl --fail --retry 30 --retry-connrefused --retry-all-errors --retry-max-time 90 --connect-timeout 2 --max-time 5 --retry-delay 2 http://127.0.0.1:3001/api/health/ready
else
  docker run -d --name smoke-web -p 127.0.0.1:8080:80 -e API_UPSTREAM=http://127.0.0.1:9 "$IMAGE"
  trap 'docker logs smoke-web 2>/dev/null || true; docker rm -f smoke-web 2>/dev/null || true' EXIT
  curl --fail --retry 20 --retry-connrefused --retry-all-errors --retry-max-time 60 --connect-timeout 2 --max-time 5 --retry-delay 1 http://127.0.0.1:8080/healthz
  curl --fail -D /tmp/headers http://127.0.0.1:8080/ -o /tmp/index.html
  grep -qi 'x-content-type-options: nosniff' /tmp/headers
  grep -qi 'x-frame-options: DENY' /tmp/headers
  # A synthetic verification token must stay out of proxy logs even when the
  # deliberately unavailable upstream returns 502.
  VERIFY_STATUS=$(curl --silent --show-error --connect-timeout 2 --max-time 5 -D /tmp/verify-headers -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8080/api/auth/verify-email?token=SCHOOLHUB_SYNTHETIC_TOKEN')
  test "$VERIFY_STATUS" = 502
  grep -qi 'referrer-policy: no-referrer' /tmp/verify-headers
  grep -qi 'cache-control: no-store' /tmp/verify-headers
  if docker logs smoke-web 2>&1 | grep -Fq 'SCHOOLHUB_SYNTHETIC_TOKEN'; then
    echo 'Verification token leaked to proxy logs'
    exit 1
  fi

fi
