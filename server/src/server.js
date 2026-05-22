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

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 30 * 24 * 60 * 60 * 1000,
    createDatabaseTable: true,
  },
  pool,
);

app.use(
  session({
    name: 'mmm.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
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
