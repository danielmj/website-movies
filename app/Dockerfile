FROM node:20-alpine AS build
WORKDIR /app

# Force NODE_ENV=development for the install step so npm doesn't strip
# devDependencies (vite is one). The output of `vite build` is the same
# regardless of NODE_ENV — vite always emits a production-optimized bundle.
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# Sanity check: fail loudly with diagnostic output if vite somehow still
# isn't installed (e.g. if the lock file was generated with --omit=dev).
RUN test -x node_modules/.bin/vite || ( \
  echo "==== vite missing from node_modules after npm ci ====" >&2 ; \
  echo "package.json devDependencies:" >&2 ; \
  node -e "console.error(require('./package.json').devDependencies)" ; \
  echo "node_modules/.bin contents:" >&2 ; \
  ls node_modules/.bin/ >&2 ; \
  echo "lock file references vite?" >&2 ; \
  grep -c '"node_modules/vite"' package-lock.json >&2 ; \
  exit 1 \
)

COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
