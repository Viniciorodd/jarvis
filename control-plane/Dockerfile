# Control-plane spine. Dependency-free Node — no npm install. Build context is the REPO ROOT
# (see docker-compose) because the Chief-of-Staff router it dispatches to lives in ../pods.
FROM node:20-alpine
WORKDIR /app
COPY control-plane ./control-plane
COPY pods ./pods
# what the pod workers need at runtime: the image engine (Fiverr) + entity/operator profiles (Gov).
# The scheduler shares this image (its compose service just overrides the command).
COPY scripts ./scripts
COPY prompts ./prompts
ENV CONTROL_PLANE_PORT=8787
EXPOSE 8787
# event store persists to /app/control-plane/data (mount a volume there)
CMD ["node", "control-plane/server.js"]
