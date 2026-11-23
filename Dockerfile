# Combined production image for Railway (serves both Phaser client & Colyseus server)
FROM node:24-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client ./
RUN npm run build

FROM node:24-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=server-build /app/server/dist ./dist
COPY server/maps ./maps
COPY server/migrations ./migrations
COPY --from=client-build /app/client/dist /app/client/dist

EXPOSE 2567
CMD ["node", "dist/index.js"]
