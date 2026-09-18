FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

ENV PORT=3000
EXPOSE 3000

# Basic container-level healthcheck (docker/compose level; K8s probes are separate, see k8s manifests)
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "server.js"]
