# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:20-alpine

# --------- 1. Dépendances (cache npm) ---------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci

# --------- 2. Environnement de dev ---------
FROM deps AS dev
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
CMD ["npm","run","dev"]

# --------- 3. Image prod ---------
FROM deps AS prod
ARG BUILD_ID
ENV BUILD_ID=$BUILD_ID
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_CACHE_DISABLED=1
COPY . .
# The offline builder supplies a placeholder for the public key only.
ARG OCR_BUILD_SUPABASE_URL
ARG OCR_BUILD_SUPABASE_ANON_KEY
RUN if [ -n "$OCR_BUILD_SUPABASE_URL" ]; then \
      NEXT_PUBLIC_SUPABASE_URL="$OCR_BUILD_SUPABASE_URL" \
      NEXT_PUBLIC_SUPABASE_ANON_KEY="$OCR_BUILD_SUPABASE_ANON_KEY" npm run build; \
    else npm run build; fi && npm prune --omit=dev

RUN mkdir -p /opt \
  && cp -a .next/standalone/. /opt/ \
  && cp -a .next/static /opt/.next/static \
  && cp -a public /opt/public \
  && cp package.json /opt/
  
WORKDIR /opt
EXPOSE 3000
CMD ["node", "server.js"]
