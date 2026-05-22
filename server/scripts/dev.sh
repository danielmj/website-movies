#!/usr/bin/env bash
# scripts/dev.sh — invoked from `npm run dev` (and init-db) for local development.
#
# Loads ~/Developer/WebsiteData/.env so platform-managed secrets are available,
# then overrides the docker-internal hostnames + maps the shared `app` user
# to the movies database.
#
# Production never runs this — the Dockerfile uses a direct CMD and the
# docker-compose.yml hardcodes the in-cluster hostnames.

set -eu

ENV_FILE="${WEBSITE_DATA_FOLDER:-$HOME/Developer/WebsiteData}/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

# Local dev runs over plain HTTP (http://localhost:5173 + http://localhost:4000),
# so a Secure session cookie would be silently dropped by the browser. Override
# NODE_ENV here so the API's `cookie.secure = NODE_ENV === 'production'` lands
# as false during local dev, regardless of what the platform .env sets globally.
export NODE_ENV=development

# Platform's mysql container is exposed on host :3306 — hostname `mysql`
# only resolves inside docker, so use 127.0.0.1 here.
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=app
export MYSQL_PASSWORD="${APP_MYSQL_PASSWORD:-}"
export MYSQL_DATABASE=movies
export SESSION_SECRET="${MOVIES_SESSION_SECRET:-dev-secret-change-me}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"

[ -n "$MYSQL_PASSWORD" ] || {
  echo "!!! APP_MYSQL_PASSWORD not set in $ENV_FILE — run ./platform secrets unpack" >&2
  exit 1
}

exec "$@"
