FROM node:24-bookworm-slim
WORKDIR /app

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_USERCONFIG=/dev/null

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY src ./src
COPY data ./data
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
