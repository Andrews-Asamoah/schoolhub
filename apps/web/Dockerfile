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
RUN pnpm --filter @schoolhub/shared build && pnpm --filter @schoolhub/web build

FROM nginx:1.27-alpine
# nginx renders templates in this folder at start-up, substituting env vars.
ENV API_UPSTREAM=http://api:3001
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
