# Portable image so the app can run on any host, not just Railway.
# Russian users cannot reach *.up.railway.app without a VPN, and most hosting
# providers that are reachable from Russia deploy from a Dockerfile.
#
# It lives in deploy/ rather than the repo root on purpose: Railway picks up a
# root Dockerfile in preference to its own builder, and doing so once already
# took production down. Build it explicitly:
#
#   docker build -f deploy/Dockerfile -t fatera .

FROM node:20-alpine AS build
WORKDIR /app

# Install with the lockfile first so the dependency layer is cached.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop the build-only dependencies from the layer we ship.
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# The server reads PORT and falls back to 5000. Deliberately not set here:
# every host injects its own, and a hardcoded value silently wins over it.
EXPOSE 5000

CMD ["node", "dist/index.js"]
