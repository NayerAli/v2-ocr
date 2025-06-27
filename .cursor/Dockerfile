# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:20-alpine

# Base image with development tools for background agents
FROM ${NODE_IMAGE}

# Install development dependencies and tools
RUN apk add --no-cache \
    git \
    curl \
    wget \
    vim \
    nano \
    bash \
    && npm install -g npm@latest

# Create user and set up home directory
RUN addgroup -g 1000 ubuntu && \
    adduser -D -s /bin/bash -u 1000 -G ubuntu ubuntu

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
CMD ["/bin/bash"]