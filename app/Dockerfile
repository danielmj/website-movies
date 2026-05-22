FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# --include=dev forces vite (a devDependency) to install even if the build
# environment has NODE_ENV=production. Without this, `npm run build` fails
# with "vite: not found".
RUN npm ci --include=dev
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
