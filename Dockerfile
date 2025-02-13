# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency files first
COPY package*.json ./
COPY prisma/ ./prisma/

# Install all dependencies including devDependencies
RUN npm ci
RUN npx prisma generate

# Copy all source files
COPY . .

# Build the application
RUN npm run build

# Stage 2: Create production image
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./
COPY prisma/ ./prisma/

# Install production dependencies
RUN npm ci --omit=dev

# Copy built assets from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/server ./.next/server

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nextjs -G nodejs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]