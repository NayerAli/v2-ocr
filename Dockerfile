FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests and install production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY . .
COPY .env.local .env.local
RUN npm run build

# 2. Runner stage: setup production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./

# Expose and start
EXPOSE 3000
CMD ["npm", "run", "start"] 