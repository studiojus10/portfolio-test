# ---- build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:alpine
ARG COMMIT_HASH
LABEL org.opencontainers.image.title="studiojus10" \
      org.opencontainers.image.source="https://git.daveynet.xyz/davey/studiojus10" \
      org.opencontainers.image.revision=$COMMIT_HASH
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
