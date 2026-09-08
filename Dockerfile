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
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN apk add --no-cache su-exec && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data && chown -R node:node /data /app
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4321
WORKDIR /app/server
# The entrypoint starts as root, fixes ownership of the bind-mounted /data, then runs the app as "node".
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--no-warnings", "index.js"]
