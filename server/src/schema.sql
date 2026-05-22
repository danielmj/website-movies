-- Maybe Movie Mondays schema
-- Idempotent: safe to run on a fresh or existing DB.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- A user's relationship to a movie. status is required, rating only when seen.
CREATE TABLE IF NOT EXISTS user_movies (
  user_id INT NOT NULL,
  movie_id INT NOT NULL,
  status ENUM('seen','want_to_see','not_interested') NOT NULL,
  rating ENUM('high_rec','rec','neutral','dont_like','really_dont_like') NULL,
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
