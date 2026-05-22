FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./

# `NODE_ENV=` (empty) for just this command guarantees npm can't possibly
# strip devDependencies, regardless of any inherited env, .npmrc, or build
# arg leaking into the build context. `npm install --include=dev` is
# belt-and-suspenders on top.
RUN NODE_ENV= npm install --include=dev

# Fail loudly if vite still didn't land — gives us a clear diagnostic
# instead of the cryptic "vite: not found" later.
RUN test -x node_modules/.bin/vite || ( \
  echo "==== vite missing from node_modules after install ====" >&2 ; \
  echo "--- npm config (relevant) ---" >&2 ; \
  npm config get production omit include >&2 ; \
  echo "--- env ---" >&2 ; \
  env | grep -iE 'node_env|npm_config' >&2 ; \
  echo "--- .npmrc files visible ---" >&2 ; \
  ls -la /root/.npmrc /etc/npmrc /app/.npmrc 2>&1 >&2 || true ; \
  echo "--- package.json devDependencies ---" >&2 ; \
  node -e "console.error(require('./package.json').devDependencies)" ; \
  echo "--- node_modules top level (first 30) ---" >&2 ; \
  ls node_modules/ | head -30 >&2 ; \
  exit 1 \
)

COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Direct npx avoids any shell PATH weirdness with `npm run`.
RUN npx vite build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
