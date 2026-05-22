const mysql = require('mysql2/promise');

// Prefer MYSQL_* (platform/sibling convention); fall back to DB_* for backward compat.
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || process.env.DB_PORT) || 3306,
  user: process.env.MYSQL_USER || process.env.DB_USER || 'movies',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || 'movies',
  database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'movies',
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true,
  dateStrings: true,
});

module.exports = pool;
