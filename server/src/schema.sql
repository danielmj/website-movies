-- Maybe Movie Mondays schema
-- Idempotent: safe to run on a fresh or existing DB.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255),
  apple_user_id VARCHAR(255) UNIQUE,
  google_user_id VARCHAR(255) UNIQUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pending one-time codes for SMS / email sign-in. Codes are stored hashed so
-- a database leak doesn't expose live login codes. Pruned on verify and on
-- a 10-minute interval from server.js.
CREATE TABLE IF NOT EXISTS auth_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('sms','email') NOT NULL,
  target VARCHAR(255) NOT NULL,        -- E.164 phone or lowercase email
  code_hash VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kind_target (kind, target),
  INDEX idx_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS movies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tmdb_id INT UNIQUE,
  imdb_id VARCHAR(20) UNIQUE,
  title VARCHAR(500) NOT NULL,
  year INT,
  decade INT,
  duration_minutes INT,
  imdb_rating DECIMAL(3,1),
  poster_url VARCHAR(500),
  overview TEXT,
  bechdel_rating TINYINT,
  bechdel_passes BOOLEAN,
  notes TEXT,
  added_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_year (year),
  INDEX idx_decade (decade)
);

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id INT NOT NULL,
  genre VARCHAR(100) NOT NULL,
  PRIMARY KEY (movie_id, genre),
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- A user's relationship to a movie. status records whether they've watched
-- it (seen / not_interested — the UI maps "Haven't seen" to 'not_interested').
-- interest captures want-to-see-this-with-the-group on its own axis, so a
-- user who has seen a film can still flag "want to see again". rating is
-- only meaningful when status='seen'.
CREATE TABLE IF NOT EXISTS user_movies (
  user_id INT NOT NULL,
  movie_id INT NOT NULL,
  status ENUM('seen','want_to_see','not_interested') NOT NULL,
  rating ENUM('high_rec','rec','neutral','dont_like','really_dont_like') NULL,
  interest ENUM('want_to_see','indifferent','not_interested') NOT NULL DEFAULT 'indifferent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, movie_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maybe_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  started_by_user_id INT NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  watched_movie_id INT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (watched_movie_id) REFERENCES movies(id) ON DELETE SET NULL,
  INDEX idx_active (active)
);

CREATE TABLE IF NOT EXISTS maybe_attendees (
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  rating_prompt_dismissed_at TIMESTAMP NULL,
  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES maybe_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maybe_votes (
  session_id INT NOT NULL,
  movie_id INT NOT NULL,
  user_id INT NOT NULL,
  vote ENUM('up','down') NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, movie_id, user_id),
  FOREIGN KEY (session_id) REFERENCES maybe_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Manually-recorded watch events (admin-entered). Distinct from
-- maybe_sessions.watched_movie_id, which only records movies watched
-- through a Maybe Movie session. Use this for retroactively logging
-- watches that happened before the app existed, or outside a session.
CREATE TABLE IF NOT EXISTS watch_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  movie_id INT NOT NULL,
  watched_at DATE NOT NULL,
  notes VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  INDEX idx_movie (movie_id),
  INDEX idx_watched_at (watched_at)
);

-- Free-text user comments on a movie. Edited/deleted by the author or any
-- admin. updated_at is bumped on edit so the UI can flag "edited" suffixes.
CREATE TABLE IF NOT EXISTS movie_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  movie_id INT NOT NULL,
  user_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  INDEX idx_movie (movie_id),
  INDEX idx_user  (user_id)
);

-- One row per attempt to fetch the bechdeltest.com RSS feed. Surfaces
-- "what did the last weekly pull do" in the admin panel: HTTP status,
-- how many items were in the feed, how many were new, how many were
-- skipped (missing imdb_id, etc.), and how many movies got synced after.
CREATE TABLE IF NOT EXISTS bechdel_rss_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status_code SMALLINT NULL,
  items_seen INT NULL,
  inserted INT NULL,
  skipped INT NULL,
  synced INT NULL,
  error VARCHAR(500) NULL,
  INDEX idx_fetched_at (fetched_at)
);

-- Cached Bechdel test results. Seeded from server/data/bechdel-movies.json
-- on server boot (the bechdeltest.com API was retired). Keyed by IMDb id
-- for direct lookup; secondary index on (year, passes) so the "browse"
-- query can grab the last few years' passers cheaply.
CREATE TABLE IF NOT EXISTS bechdel_movies (
  imdb_id VARCHAR(20) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  year INT NOT NULL,
  passes BOOLEAN NOT NULL,
  INDEX idx_year_passes (year, passes)
);

-- Append-only log of external-API calls so the admin panel can show usage
-- vs each provider's daily quota (e.g. OMDB's 1000/day). Pruned automatically
-- to the last 90 days; counts are aggregated per-service via grouped SUMs
-- so this table stays cheap to query even after weeks of activity.
CREATE TABLE IF NOT EXISTS api_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  service VARCHAR(32) NOT NULL,
  called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status_code SMALLINT NULL,
  INDEX idx_service_time (service, called_at)
);
