# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx tsx swagger.ts
RUN npx tsc

# ---- Production stage ----
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./

# Copy prisma schema BEFORE npm ci so postinstall (prisma generate) can find it
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN npm ci --omit=dev

# Copy compiled output and required files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/swagger-output.json ./swagger-output.json

EXPOSE 3000

CMD ["node", "dist/src/app.js"]
