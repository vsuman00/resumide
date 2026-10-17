FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS development-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN mkdir -p public && npm ci
COPY . .

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS production-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN mkdir -p public && npm ci --omit=dev

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build-env
WORKDIR /app
COPY --from=development-dependencies-env /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ENV NODE_ENV=production
WORKDIR /app
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx
COPY --chown=node:node package.json package-lock.json ./
COPY --from=production-dependencies-env --chown=node:node /app/node_modules ./node_modules
COPY --from=build-env --chown=node:node /app/build ./build
COPY --from=build-env --chown=node:node /app/public ./public
COPY --from=build-env --chown=node:node /app/app ./app
COPY --from=build-env --chown=node:node /app/scripts ./scripts
COPY --from=build-env --chown=node:node /app/assets ./assets
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--experimental-strip-types", "scripts/server.mjs"]
