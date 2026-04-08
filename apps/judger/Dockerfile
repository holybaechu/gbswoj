FROM rust:alpine AS builder

WORKDIR /app
COPY . .

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release -p judger && \
    cp /app/target/release/judger /app/judger_bin

FROM alpine:latest

RUN apk add --no-cache \
    nsjail \
    python3

COPY --from=builder /app/judger_bin /usr/local/bin/judger

RUN addgroup -g 9999 nsjailgroup && \
    adduser -u 9999 -G nsjailgroup -D nsjailuser

USER nsjailuser

CMD ["judger"]
