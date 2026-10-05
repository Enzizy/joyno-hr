FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations

# A restricted checkout umask must not make application files unreadable to node.
RUN chmod -R a+rX ./src ./migrations && chmod a+r package.json package-lock.json

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
