FROM node:24-alpine AS base

RUN corepack enable

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile --filter @interviewer-ai/api...

FROM dependencies AS build

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/types packages/types

RUN pnpm --filter @interviewer-ai/api build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist

EXPOSE 4000

CMD ["node", "dist/server.mjs"]
