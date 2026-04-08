FROM oven/bun:1.3.11-alpine as pruner

WORKDIR /app
COPY . .
RUN bunx turbo prune @gbswoj/backend --docker

FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./

RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
