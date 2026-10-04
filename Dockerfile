FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/engine/package.json ./packages/engine/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/templates/package.json ./packages/templates/
COPY packages/launcher/package.json ./packages/launcher/
RUN npm ci
COPY backend ./backend
COPY frontend ./frontend
COPY packages ./packages
COPY scripts/copy-launcher-renderer.cjs ./scripts/
RUN npm run build
RUN cp backend/src/db/schema.sql backend/dist/db/schema.sql
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/packages ./packages
RUN ln -s backend/dist dist
ENV NODE_ENV=production APP_DIR=/app

FROM runtime AS api
EXPOSE 3000
CMD ["node", "dist/api/server.js"]

FROM runtime AS worker
CMD ["node", "dist/worker.js"]

FROM nginx:stable-alpine AS nginx
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/admin.conf /etc/nginx/conf.d/admin.conf
COPY docker/nginx/files.conf /etc/nginx/conf.d/files.conf
