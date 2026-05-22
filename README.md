# Maybe Movie Mondays

A small app for picking what to watch with friends. Users build a shared catalog,
mark movies as seen / want-to-see / not-interested, rate them, and start a
"maybe movie" session for an evening — filtering and voting on the catalog so
the group can pick something to watch together.

Stack: **Node + Express + MySQL** for the API, **React + Vite** for the SPA.
Movie metadata comes from **TMDB** + **OMDB** + **bechdeltest.com** (all free).

## Layout

```
movies/
├── docker-compose.yml
├── .env.example          # copy → .env
├── server/               # Express API
│   ├── src/server.js     # entrypoint
│   ├── src/schema.sql    # MySQL schema (idempotent)
│   ├── src/init-db.js    # `npm run init-db` — applies schema
│   ├── src/routes/       # auth, movies, ratings, maybe
│   └── src/services/     # tmdb, omdb, bechdel
└── app/                  # React SPA (Vite)
    └── src/
```

## Quick start (local dev, no Docker)

You need a MySQL 8 server locally and free API keys for TMDB and OMDB.

1. **Get API keys** (both are free, instant signup):
   - TMDB: https://www.themoviedb.org/settings/api
   - OMDB: https://www.omdbapi.com/apikey.aspx

2. **Configure env**:
   ```sh
   cd ~/Developer/websites/movies
   cp .env.example .env
   # edit .env and fill in TMDB_API_KEY, OMDB_API_KEY, SESSION_SECRET, DB_*
   ```

3. **Create the database** (one time):
   ```sh
   mysql -u root -p -e "CREATE DATABASE movies; \
     CREATE USER 'movies'@'%' IDENTIFIED BY 'movies'; \
     GRANT ALL ON movies.* TO 'movies'@'%';"
   ```

4. **Install + initialize schema**:
   ```sh
   cd server && npm install && npm run init-db
   ```

5. **Run API + SPA in two terminals**:
   ```sh
   # terminal 1
   cd server && npm run dev          # → http://localhost:4000

   # terminal 2
   cd app && npm install && npm run dev   # → http://localhost:5173
   ```

   Vite proxies `/api/*` to `http://localhost:4000` so cookies work end-to-end.

6. Open http://localhost:5173 and sign up. Click **Add** to add a movie via TMDB.

## Deploy via the platform

This app is platform-managed. `app.yaml` declares its env + DB requirements
and `docker-compose.yml` joins the shared `platform-net` network.

The deployable repo is **git@github.com:danielmj/website-movies.git** and the
canonical domain is **https://maybemoviemondays.com**. Both are already wired
into `platform/apps.yaml` and `platform/nginx/conf.d/movies.conf`.

1. Set secrets in `~/Developer/WebsiteSecrets/.env` (then bundle/unpack):
   ```
   APP_MYSQL_PASSWORD=...      # already shared with finance/travel
   MOVIES_SESSION_SECRET=...   # long random string
   TMDB_API_KEY=...
   OMDB_API_KEY=...
   # optional override; defaults to https://maybemoviemondays.com:
   # MOVIES_CORS_ORIGIN=https://maybemoviemondays.com
   ```
   ```sh
   ./platform secrets edit && ./platform secrets unpack
   ```

2. Push the repo (first time only):
   ```sh
   cd ~/Developer/websites/movies
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```

3. Set up DNS on the server side: add Cloudflare CNAME records for
   `maybemoviemondays.com` and `www.maybemoviemondays.com` pointing at the
   cloudflared tunnel (same target the other danj.co apps use). They must be
   "proxied" (orange cloud) so Cloudflare terminates TLS in front of the
   tunnel.

4. Deploy + apply schema:
   ```sh
   cd ~/Developer/websites/platform
   ./platform deploy movies
   docker compose -f ../movies/docker-compose.yml exec movies-api node src/init-db.js
   ./platform nginx-reload
   ```

   `deploy` provisions the `movies` MySQL database for the shared `app` user,
   builds, and starts the `movies-api` (host :3007) + `movies-app` (host :3008)
   containers. `nginx-reload` activates the vhost.

5. Sign up at https://maybemoviemondays.com — the first signup is auto-promoted
   to admin by `init-db`. Re-run init-db on the host if you signed up before
   that step ever ran:
   ```sh
   docker compose -f ../movies/docker-compose.yml exec movies-api node src/init-db.js
   ```

## How it works

**Auth** — email + password (bcrypt, cost 12), express-session backed by the
same MySQL pool via `express-mysql-session`. Session cookie is httpOnly,
SameSite=lax, 30-day expiry.

**Adding a movie** — user searches TMDB by title, picks a result, server
fetches `/movie/{id}` for runtime/genres/year/poster/IMDB id, then OMDB by
IMDB id for the IMDB rating, then bechdeltest.com by IMDB id for Bechdel. All
three are stored on the movie row. Decade is computed from year.

**Ratings** — `user_movies` row per (user, movie) with `status` ∈ {seen,
want_to_see, not_interested} and optional `rating` ∈ {high_rec, rec, neutral,
dont_like, really_dont_like} (only valid when status=seen).

**Maybe movie session** — global active session: only one is `active=TRUE` at
a time. Starting a new one ends the previous. The SPA polls
`GET /api/maybe/active` every 10s; when one exists, every signed-in user sees
the banner. Anyone (not just the starter) can edit attendees, vote, or mark a
movie watched.

**"Watched"** — for the chosen movie, every attendee gets a `seen` row
(rating left NULL so they can fill it in later) and the session is closed.

**Filters** in the maybe-movie view (intersection of attendees' state):
- Hide if anyone is `really_dont_like`
- Only show "no attendee has seen"
- Genre / decade / max duration / Bechdel passes only

**Sorts**:
- # attendees who haven't seen
- recommendation % among those who have seen
- % of attendees with `want_to_see`
- Bechdel passes first
- Net up-votes

## Notes

- The Bechdel API has limited coverage; older / obscure films will return
  `null` and the UI just hides the badge.
- OMDB free tier is 1000 calls/day. We only call it once per movie when
  it's first added.
- For prod: change `SESSION_SECRET`, set `NODE_ENV=production`, terminate TLS
  in front of the server (so `cookie.secure=true` works), and serve the SPA's
  built `dist/` from any static host with `/api/*` proxied to the server.
