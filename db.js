const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_FILE = path.join(__dirname, 'macro_tracker.db');

// Initialize database connection
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', DB_FILE);
  }
});

// Enable foreign keys constraints
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
});

// Promisified execution for queries that return multiple rows (SELECT)
function dbQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Promisified execution for queries that return a single row
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Promisified execution for insert/update/delete operations
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// Database schema initialization
async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      baseQuantity REAL NOT NULL,
      unit TEXT NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      kcal REAL NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      itemId TEXT NOT NULL,
      amount REAL NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      kcal REAL NOT NULL,
      FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      kcal REAL NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS meal_ingredients (
      mealId TEXT NOT NULL,
      ingredientId TEXT NOT NULL,
      PRIMARY KEY(mealId, ingredientId),
      FOREIGN KEY(mealId) REFERENCES meals(id) ON DELETE CASCADE,
      FOREIGN KEY(ingredientId) REFERENCES ingredients(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      referenceId TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      kcal REAL NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      protein REAL NOT NULL,
      fat REAL NOT NULL,
      carbs REAL NOT NULL,
      kcal REAL NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS weights (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL
    )
  `);
}

module.exports = {
  db,
  dbQuery,
  dbGet,
  dbRun,
  initDb
};
