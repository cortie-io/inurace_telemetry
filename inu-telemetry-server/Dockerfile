# inu-telemetry-server — compiles via tsc to dist/, systemd runs the compiled output the same way.
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/certs ./certs

EXPOSE 8090
CMD ["node", "dist/server.js"]
