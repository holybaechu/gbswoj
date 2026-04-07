FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/

RUN bun install --filter @gbswoj/backend

COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
