FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm ci

# Copy backend source & compile TypeScript
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
RUN cp src/db/schema.sql dist/db/schema.sql


# Target: API Service
FROM node:20-bookworm-slim AS api
WORKDIR /app
COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/api/server.js"]

# Target: Background Worker
FROM node:20-bookworm-slim AS worker
WORKDIR /app
COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
ENV NODE_ENV=production
CMD ["node", "dist/worker.js"]
