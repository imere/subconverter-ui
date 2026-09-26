# syntax=docker/dockerfile:1

# ---- build stage: install deps and produce the static bundle ----
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@latest
# Install dependencies first for better layer caching.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# Copy sources and build the production bundle.
COPY . .
RUN pnpm build

# ---- runtime stage: serve the SPA with nginx ----
FROM nginx:1.27-alpine AS runtime
# Single-entry nginx: serves the SPA AND reverse-proxies /sub, /version, ...
# to the internal subconverter service, so the browser never hits CORS.
COPY docker/ex/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
