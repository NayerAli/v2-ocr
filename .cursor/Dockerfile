# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:20-alpine

# Base image with development tools
FROM ${NODE_IMAGE}

# Install development dependencies and tools
RUN apk add --no-cache \
    git \
    curl \
    wget \
    vim \
    nano \
    && npm install -g npm@latest

# Create user and set up home directory
RUN addgroup -g 1000 ubuntu && \
    adduser -D -s /bin/sh -u 1000 -G ubuntu ubuntu

# Set working directory to user's home
WORKDIR /home/ubuntu

# Switch to non-root user
USER ubuntu

# Set environment variables
ENV NODE_ENV=development
ENV PATH="/home/ubuntu/.npm-global/bin:$PATH"

# Create npm global directory for user
RUN mkdir -p /home/ubuntu/.npm-global && \
    npm config set prefix '/home/ubuntu/.npm-global'

# Install global development tools
RUN npm install -g \
    typescript \
    @types/node \
    ts-node \
    nodemon \
    eslint \
    prettier

# Default command (can be overridden)
CMD ["/bin/sh"]

# --------- 1. Dépendances (cache npm) ---------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY ../package.json ../package-lock.json ./
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci
RUN npm prune --omit=dev

# --------- 2. Environnement de dev ---------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
CMD ["npm","run","dev"]

# --------- 3. Image prod ---------
FROM deps AS prod
ENV NODE_ENV=production
COPY ../. .
RUN npm run build && npm prune --omit=dev
# on extrait uniquement la sortie "standalone"
RUN mkdir -p /opt \
  && cp -a .next/standalone/. /opt/ \
  && cp -a .next/static /opt/.next/static \
  && cp -a public /opt/public \
  && cp package.json /opt/
  
WORKDIR /opt
EXPOSE 3000
CMD ["node", "server.js"]