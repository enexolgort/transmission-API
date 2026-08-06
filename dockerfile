# --- Build stage: compile TypeScript ---
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: only production deps + compiled output ---
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY openapi.yaml ./openapi.yaml

# Runs as a non-root user for defense in depth.
RUN useradd --system --uid 1001 nodeuser
USER nodeuser

EXPOSE 3000

CMD ["node", "dist/server.js"]