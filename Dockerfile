FROM golang:1.26-bookworm AS dmg-tool
WORKDIR /src
COPY backend/tools/dmg/go.mod backend/tools/dmg/go.sum ./
RUN go mod download
COPY backend/tools/dmg/main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /packpanel-dmg .

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
RUN apt-get update && apt-get install -y --no-install-recommends nsis wixl squashfs-tools && rm -rf /var/lib/apt/lists/*
COPY --from=dmg-tool /packpanel-dmg /usr/local/bin/packpanel-dmg
ADD https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64 /usr/local/share/packpanel/appimage-runtime
ADD https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F0.29.0/apple-codesign-0.29.0-x86_64-unknown-linux-musl.tar.gz /tmp/rcodesign-amd64.tar.gz
ADD https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F0.29.0/apple-codesign-0.29.0-aarch64-unknown-linux-musl.tar.gz /tmp/rcodesign-arm64.tar.gz
RUN echo '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d  /usr/local/share/packpanel/appimage-runtime' | sha256sum -c - \
    && chmod 644 /usr/local/share/packpanel/appimage-runtime \
    && echo 'dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002  /tmp/rcodesign-amd64.tar.gz' | sha256sum -c - \
    && echo '4af92c87ddf52f5f2d1258a3b4e56c7dcb8f1b2468df744976c5f139e031961f  /tmp/rcodesign-arm64.tar.gz' | sha256sum -c - \
    && tar -xzO -f "/tmp/rcodesign-$(dpkg --print-architecture).tar.gz" --wildcards '*/rcodesign' > /usr/local/bin/rcodesign \
    && chmod 755 /usr/local/bin/rcodesign \
    && rm /tmp/rcodesign-*.tar.gz
ARG PACKPANEL_BUILD_REVISION
ENV PACKPANEL_BUILD_REVISION=$PACKPANEL_BUILD_REVISION
CMD ["node", "dist/worker.js"]

FROM nginx:stable-alpine AS nginx
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/admin.conf /etc/nginx/conf.d/admin.conf
COPY docker/nginx/files.conf /etc/nginx/conf.d/files.conf
