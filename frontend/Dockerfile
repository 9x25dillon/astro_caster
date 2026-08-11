# Astra frontend — build the Vite/React PWA, serve the static bundle via nginx.
# Build context: repository ROOT (the build needs ../packages for @astra/core).
#   docker build -f frontend/Dockerfile .

# ---- build stage -----------------------------------------------------------
# node:20 (glibc) rather than alpine: vite 8's rolldown bundler ships prebuilt
# native binaries that are simplest on glibc.
FROM node:20 AS build
WORKDIR /repo

# Install deps first (cached layer). package-lock.json is present → npm ci.
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci

# The monorepo engine the frontend imports as @astra/core, then the app source.
COPY packages/ packages/
COPY frontend/ frontend/

RUN cd frontend && npm run build

# ---- serve stage -----------------------------------------------------------
FROM nginx:1.27-alpine
# openssl CLI is not in nginx:alpine by default; 40-ensure-cert.sh needs it to
# self-sign a development certificate when no real one is mounted.
RUN apk add --no-cache openssl
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/docker-entrypoint.d/40-ensure-cert.sh /docker-entrypoint.d/40-ensure-cert.sh
RUN chmod +x /docker-entrypoint.d/40-ensure-cert.sh
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
# The marketing page is served on its own hostname from its own root — see the
# M4 layout note at the top of nginx.conf. It is plain HTML with no build step,
# so it is copied straight from the repo rather than through the build stage.
COPY landing/ /usr/share/nginx/landing/

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
