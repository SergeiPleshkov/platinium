# syntax=docker/dockerfile:1.7

###############################################################################
# Base — pnpm via corepack, pinned to the version in package.json.
###############################################################################
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

###############################################################################
# Dependencies — cached independently of source, so a code change does not
# reinstall node_modules. `--frozen-lockfile` makes the build fail rather than
# silently resolve different versions than the lockfile records.
###############################################################################
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

###############################################################################
# Build — typecheck runs as part of `pnpm build`, so a type error fails the
# image rather than shipping.
###############################################################################
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

###############################################################################
# Development — the Vite dev server with HMR, for `docker compose up dev`.
###############################################################################
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
# `--host` binds all interfaces; without it the server is unreachable from the host.
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

###############################################################################
# Production — static files behind nginx.
#
# `nginx-unprivileged` runs as a non-root user (uid 101) and listens on 8080,
# so nothing in the runtime image needs elevated privileges. The build
# toolchain, source and node_modules are all left behind in earlier stages.
###############################################################################
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
# Two COPY lines, not one with two sources: a multi-source COPY treats the
# destination as a directory and keeps the original filenames, so the site
# config landed beside the base image's default.conf instead of replacing it —
# and the default kept winning, 404ing every client-side route.
COPY --link docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --link docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY --link --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Fails the container rather than quietly serving nothing if nginx stops responding.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
