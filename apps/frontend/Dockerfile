FROM oven/bun:1.3.11-alpine as pruner

WORKDIR /app
COPY . .
RUN bunx turbo prune @gbswoj/frontend --docker

FROM oven/bun:1.3.11-alpine as builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./

RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

WORKDIR /app/apps/frontend
RUN bun run build

FROM oven/bun:1.3.11-alpine as runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY --from=builder /app/apps/frontend/build ./build
COPY --from=builder /app/apps/frontend/package.json ./

EXPOSE 4000

CMD ["bun", "run", "build/index.js"]
