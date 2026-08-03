# Contact-form mailer sidecar (see mailer/server.js).
FROM node:26-alpine
WORKDIR /app
ARG COMMIT_HASH
LABEL org.opencontainers.image.title="studiojus10-mailer" \
      org.opencontainers.image.source="https://git.daveynet.xyz/davey/studiojus10" \
      org.opencontainers.image.revision=$COMMIT_HASH

# Install prod deps against the lockfile first for cacheable layers.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js queue.js validate.js ./

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

# 99:100, not node:node: this container runs as 99:100 (below), matching
# nginx's worker uid and its supplementary "users" group, so that has to be
# the directory owner baked in here too -- see the USER line for why running
# as "node" (uid 1000) would no longer match. Numeric, not a name: nothing
# requires uid 99/gid 100 to resolve to a passwd/group entry, and none does
# in this image.
#
# This specifically matters for a local named volume (this repo's own
# docker-compose.yml): Docker copies an image's directory content into a
# brand-new empty volume the first time it's used, preserving whatever
# ownership was baked in at build time. A node:node bake would leave the
# mailer -- now running as 99 -- unable to write its own queue/ and failed/
# once that stale content is copied in. A bind mount (production) ignores
# image content entirely and always uses the host path's real ownership
# instead; see mailer/README.md for what that requires there.
RUN mkdir -p /data/queue /data/failed /data/inbox && chown -R 99:100 /data

# Not "node" (uid 1000, this image's conventional default): 99:100 is what
# nginx's worker (uid 101, supplementary group 100 via `addgroup nginx
# users` in the web image) needs to share inbox/ with, and it's what
# production's Unraid compose already overrides this to. Baking it in here
# means that override is confirming the default, not fighting it, and a
# local `docker compose up` exercises the same ownership model production
# does instead of silently running as a uid nothing else in this system uses.
USER 99:100

# Liveness only -- deliberately not asserting "ok":true. That flips false when
# anything sits in failed/, nothing clears it automatically, and no restart
# would fix it; a single undeliverable message would pin the container unhealthy
# forever. Queue health is a monitoring concern on /api/health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
