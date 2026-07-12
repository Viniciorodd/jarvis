# Control-plane spine. Dependency-free Node — no npm install. Build context is the REPO ROOT
# (see docker-compose) because the Chief-of-Staff router it dispatches to lives in ../pods.
FROM node:20-alpine
WORKDIR /app
# tzdata — belt-and-braces so TZ=America/New_York (set in docker-compose) actually resolves on alpine.
# Without it the containers run UTC and every schedule.json at_hour fires at 4-5 AM ET (the "Jarvis
# talks to me at dawn" bug). Covers the server, scheduler, AND telegram-bridge (all share this image),
# plus every child process they spawn.
RUN apk add --no-cache tzdata
# optional email deps for the Gov pod (Hector's IMAP reply-reading + SMTP send). Guarded so a network
# hiccup can NEVER fail the build — if install is skipped, reply-reading just degrades gracefully.
COPY control-plane/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund || echo "optional email deps not installed; reply-reading will degrade"
COPY control-plane ./control-plane
COPY pods ./pods
# the Telegram bridge shares this image (compose runs it as its own service). Dependency-free; imports
# only from pods/ (already copied), so just the one file is needed — keeps the image small.
COPY companion/telegram-bridge.mjs ./companion/telegram-bridge.mjs
# what the pod workers need at runtime: the image engine (Fiverr) + entity/operator profiles (Gov).
# The scheduler shares this image (its compose service just overrides the command).
COPY scripts ./scripts
COPY prompts ./prompts
ENV CONTROL_PLANE_PORT=8787
EXPOSE 8787
# event store persists to /app/control-plane/data (mount a volume there)
CMD ["node", "control-plane/server.js"]
