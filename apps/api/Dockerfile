# SchoolHub API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t schoolhub-api --build-arg BUILD_SHA=$(git rev-parse --short HEAD) .
FROM node:22-slim

# Prisma's engines need OpenSSL; tini reaps processes and forwards signals.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.4.1

WORKDIR /repo

# Dependency layer: manifests only, so code changes do not reinstall packages.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @schoolhub/api...

COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @schoolhub/shared build \
 && pnpm --filter @schoolhub/api exec prisma generate --config prisma.config.ts \
 && pnpm --filter @schoolhub/api exec nest build

# The full workspace (including the Prisma CLI) stays in the image on purpose:
# `prisma migrate deploy` runs from this same image in the release pipeline.
ARG BUILD_SHA=unknown
ENV NODE_ENV=production \
    BUILD_SHA=${BUILD_SHA} \
    PORT=3001

WORKDIR /repo/apps/api
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
