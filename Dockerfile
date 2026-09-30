# Portable image, so the app can run on any host.
#
# It sits at the repo root because that is where hosts look for it, and
# because a host that takes a path to a Dockerfile in a subdirectory (Timeweb
# does) makes that subdirectory the build context — from deploy/ the sources
# would not be visible at all.

FROM node:20-alpine AS build
WORKDIR /app

# Install with the lockfile first so the dependency layer is cached.
COPY package.json package-lock.json ./
# npm can print an error and still exit 0 ("Exit handler never called"),
# leaving no node_modules behind. Without this check the build sails past it
# and the failure only surfaces at runtime, on the host, in front of users.
RUN npm ci --no-audit --no-fund && test -x node_modules/.bin/vite

COPY . .
# Likewise: assert the build actually produced both halves of the app.
RUN npm run build && test -f dist/index.js && test -f dist/public/index.html

# Drop the build-only dependencies from the layer we ship.
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# 8080 is the port both Railway and Timeweb expect a container to listen on,
# and a host that injects its own PORT overrides this value rather than
# fighting it. Hardcoding 5000 here once took production down: the app
# listened on 5000 while the domain pointed at 8080.
ENV PORT=8080
EXPOSE 8080

# Where to keep the JSON snapshot when no DATABASE_URL is configured. /data is
# the persistent mount amvera.yml declares; a host that mounts nothing there
# gets a folder inside the container instead, which the startup log names so
# the difference is visible. Set DATABASE_URL and this is ignored.
ENV DATA_DIR=/data

CMD ["node", "dist/index.js"]
