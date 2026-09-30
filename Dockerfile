# syntax=docker/dockerfile:1

# ---- build: install, build web and server, isolate server prod deps ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Manifests first so the dependency layer is cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @sysarch/web build \
 && pnpm --filter @sysarch/server build \
 && pnpm --filter @sysarch/server deploy --prod --legacy /out

# ---- runtime: one process serves the API and the built web app ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/sysarch.db \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/drizzle ./drizzle
COPY --from=build /app/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
