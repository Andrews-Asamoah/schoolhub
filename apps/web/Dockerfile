# SchoolHub web (static build behind nginx). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t schoolhub-web .
FROM node:22-slim AS build
RUN npm install -g pnpm@12.4.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @schoolhub/web...
COPY packages ./packages
COPY apps/web ./apps/web
# Leave empty to call the API on the same origin under /api (the default).
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
# Error tracking (optional). Leave empty to disable. The DSN is public by design.
ARG VITE_SENTRY_DSN=""
ARG BUILD_SHA=""
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_BUILD_SHA=${BUILD_SHA}
RUN pnpm --filter @schoolhub/shared build && pnpm --filter @schoolhub/web build

FROM nginx:1.27-alpine
# nginx renders templates in this folder at start-up, substituting env vars.
ENV API_UPSTREAM=http://api:3001 \
    PUBLIC_SCHEME=auto
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# Source maps are for the error tracker only (upload them from the build stage in CI); never serve them.
RUN find /usr/share/nginx/html -name '*.map' -delete
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
