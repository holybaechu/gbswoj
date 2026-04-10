FROM node:24-alpine AS web-builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache bash
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm exec turbo run build --filter=!@gbswoj/judger

FROM rust:1.94.1-alpine AS rust-builder
WORKDIR /app
COPY . .
RUN apk add --no-cache musl-dev
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release -p judger && \
    cp /app/target/release/judger /app/judger_bin

FROM node:24-alpine
WORKDIR /app

RUN apk add --no-cache \
    nsjail \
    python3 \
    redis \
    caddy \
    supervisor \
    && addgroup -g 9999 nsjailgroup \
    && adduser -u 9999 -G nsjailgroup -D nsjailuser

COPY --from=web-builder /app /app
COPY --from=rust-builder /app/judger_bin /usr/local/bin/judger

RUN cp -r apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/static
RUN cp -r apps/frontend/public apps/frontend/.next/standalone/apps/frontend/public

COPY deploy/supervisord.conf /etc/supervisord.conf
COPY deploy/Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p /var/lib/redis && chown redis:redis /var/lib/redis

ENV PORT=4000
ENV REDIS_URL=redis://localhost:6379
ENV NODE_ENV=production

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]