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

COPY server.js ./

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
