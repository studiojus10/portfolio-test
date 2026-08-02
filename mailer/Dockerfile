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

COPY server.js queue.js ./

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

# A fresh named volume mounted at /data inherits this ownership, so the local
# compose setup needs no host-side preparation.
RUN mkdir -p /data/queue /data/failed && chown -R node:node /data
USER node
CMD ["node", "server.js"]
