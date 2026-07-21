FROM node:20-alpine

WORKDIR /app

# npm ci (not npm install) installs exactly what's in package-lock.json —
# reproducible, and fails loudly if the lockfile and package.json drift.
COPY package*.json ./
RUN npm ci

COPY . .

RUN mkdir -p uploads \
    && chown -R node:node /app

# node:alpine ships a non-root "node" user out of the box — no need to
# create one manually.
USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# ts-node is already a devDependency in package-lock.json (unlike tsx,
# which wasn't declared anywhere) — this runs the TS entry point directly,
# no separate compile step, same as your current setup.
CMD ["npx", "ts-node", "src/index.ts"]