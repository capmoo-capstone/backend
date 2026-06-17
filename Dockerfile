# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsx swagger.ts
RUN npx tsc

# ---- Production stage ----
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and required files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/swagger-output.json ./swagger-output.json
COPY --from=builder /app/prisma ./prisma

# Generate Prisma client for production
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/app.js"]