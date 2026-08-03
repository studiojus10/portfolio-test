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
# njs handles /api/contact so submissions survive the mailer being down.
# The base image has no modules-enabled include and no load_module line, so it
# is prepended to the main context here. addgroup puts the nginx worker in gid
# 100 (users), which is what lets it write the 0o775 spool inbox owned by 99:100.
RUN apk add --no-cache nginx-module-njs \
 && sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf \
 && addgroup nginx users
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY njs/spool.js /etc/nginx/njs/spool.js
COPY --from=build /app/dist /usr/share/nginx/html
# njs compiles js_import at config-parse time, so a syntax error or an
# unsupported language feature in spool.js would otherwise only surface as a
# container that fails to start -- taking the whole site down, not just the
# contact form. Fail the build instead of shipping that image.
RUN nginx -t
EXPOSE 80
# 127.0.0.1, not localhost: busybox wget resolves localhost to the IPv6
# loopback first, and nginx's `listen 80` binds 0.0.0.0 only -- so the probe
# got "connection refused" on ::1 and the container sat unhealthy while
# serving traffic perfectly well.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
