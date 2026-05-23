require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');

const pool = require('./db');

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);

// SESSION_SECRET drives cookie HMAC. If it changes between restarts, every
// existing cookie fails validation and users appear "signed out" even though
// their session row in MySQL is intact. Refuse to start in production with a
// missing/default secret so we never silently rotate it on restart.
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';
if (process.env.NODE_ENV === 'production' && sessionSecret === 'dev-secret-change-me') {
  throw new Error('SESSION_SECRET is required in production (cookies would invalidate on every restart)');
}

// In production we keep users signed in for a year — Maybe Movie Mondays
// is a low-friction app and people use it monthly at most. In dev we keep
// it shorter so testing session expiry doesn't take a year.
const SESSION_TTL_MS = process.env.NODE_ENV === 'production'
  ? 365 * 24 * 60 * 60 * 1000
  : 30 * 24 * 60 * 60 * 1000;

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: SESSION_TTL_MS,
    createDatabaseTable: true,
  },
  pool,
);

app.use(
  session({
    name: 'mmm.sid',
    secret: sessionSecret,
    // resave:false + rolling:true together: the row is only re-written when
    // the session payload actually changes (cheap), but the cookie's
    // max-age is refreshed on every response. So active users stay logged
    // in indefinitely instead of getting kicked out the SESSION_TTL_MS
    // mark regardless of activity.
    resave: false,
    rolling: true,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
    },
  }),
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const { touchLastSeen } = require('./auth');
app.use(touchLastSeen);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/maybe', require('./routes/maybe'));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`movies-server listening on :${port}`);
});

// Prune the api_usage table once a day so it doesn't grow unbounded.
const usage = require('./services/usage');
setInterval(() => { usage.pruneOlderThan90Days(); }, 24 * 60 * 60 * 1000);

// Seed the Bechdel-results table on startup if empty, then push any
// new/changed entries onto the cached bechdel_passes column on movies. Both
// are idempotent — subsequent boots are a no-op once everything's in sync.
const bechdel = require('./services/bechdel');
bechdel.seedFromJson()
  .then(() => bechdel.syncMovies())
  .then((n) => { if (n) console.log(`[bechdel] synced ${n} movies from bechdel_movies`); })
  .catch((err) => console.error('[bechdel] startup sync failed:', err.message));
