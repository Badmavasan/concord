# Build the React client, then run the Node server that serves it.
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
# Persistent data: SQLite database and uploaded PDFs live under /data
ENV DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
EXPOSE 4321
WORKDIR /app/server
USER node
CMD ["node", "--no-warnings", "index.js"]
