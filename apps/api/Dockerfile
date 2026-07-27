FROM node:24-alpine AS base

RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/prompts/package.json packages/prompts/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile --filter @interviewer-ai/api...

FROM dependencies AS build

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/prompts packages/prompts
COPY packages/types packages/types

RUN pnpm --filter @interviewer-ai/api prisma:generate && pnpm --filter @interviewer-ai/api build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=build --chown=app:app /workspace/node_modules ./node_modules
COPY --from=build --chown=app:app /workspace/apps/api/dist ./dist
COPY --from=build --chown=app:app /workspace/apps/api/prisma ./prisma

USER app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
