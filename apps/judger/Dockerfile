FROM rust:alpine AS builder

WORKDIR /app
COPY . .
RUN cargo build --release -p judger

FROM alpine:latest

RUN apk add --no-cache \
    nsjail \
    python3

COPY --from=builder /app/target/release/judger /usr/local/bin/judger

RUN addgroup -g 99999 nsjailgroup && \
    adduser -u 99999 -G nsjailgroup -D nsjailuser

CMD ["judger"]
