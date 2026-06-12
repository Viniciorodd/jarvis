FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY config ./config
COPY public ./public
ENV DATA_DIR=/data
EXPOSE 8099
CMD ["node", "server.js"]
