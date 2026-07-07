# OpenMacros - Local Macro & Meal Tracker

OpenMacros is a locally hosted web application for tracking daily macro-nutritional intake. It runs as a standalone Node.js and Express application with a SQLite database backend.

## Features

*   **Daily Intake Logging**: Log consumption of food items or composed meal recipes.
*   **Progress Dashboard**: Displays daily intake totals and progress against targets for protein, fat, carbohydrates, and calories.
*   **Food Library (CRUD)**: Manage baseline food items, including name, unit, and macro-nutritional density.
*   **Ingredients Manager (CRUD)**: Define ingredients with custom quantities linked to base library items.
*   **Meal Recipes (CRUD)**: Compose meal recipes from ingredients. The server automatically calculates the total nutrition profile of the recipe.
*   **Cascading Updates**: Editing a food library item automatically recalculates the protein, fat, carb, and calorie totals for all related ingredients, meals, and historical logs.
*   **Weight Tracker**: Log monthly bodyweight and visualize trends on an SVG chart.
*   **Goals Configuration**: Set custom daily targets and reference a macro calculation guide.

## Tech Stack

*   **Frontend**: HTML, CSS, and Vanilla JavaScript.
*   **Backend**: Node.js and Express.
*   **Database**: SQLite (`sqlite3` driver).

## File Structure

*   `server.js` - Express backend server. Defines REST API endpoints, serves static assets, and handles cascading update logic.
*   `db.js` - SQLite connection helper. Sets up database tables, enables foreign keys (`PRAGMA foreign_keys = ON;`), and exports helper functions (`dbQuery`, `dbGet`, `dbRun`).
*   `package.json` - Declares node scripts and dependencies (`express`, `cors`, `sqlite3`).
*   `public/index.html` - Static HTML page layout and UI structure.
*   `public/app.js` - Frontend logic, API fetch calls, autocomplete dropdowns, and UI rendering.
*   `public/style.css` - UI layout, style system, and UI theme.

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  baseQuantity REAL NOT NULL,
  unit TEXT NOT NULL,
  protein REAL NOT NULL,
  fat REAL NOT NULL,
  carbs REAL NOT NULL,
  kcal REAL NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protein REAL NOT NULL,
  fat REAL NOT NULL,
  carbs REAL NOT NULL,
  kcal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  mealId TEXT NOT NULL,
  ingredientId TEXT NOT NULL,
  PRIMARY KEY(mealId, ingredientId),
  FOREIGN KEY(mealId) REFERENCES meals(id) ON DELETE CASCADE,
  FOREIGN KEY(ingredientId) REFERENCES ingredients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL, -- 'item' or 'meal'
  referenceId TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  protein REAL NOT NULL,
  fat REAL NOT NULL,
  carbs REAL NOT NULL,
  kcal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  protein REAL NOT NULL,
  fat REAL NOT NULL,
  carbs REAL NOT NULL,
  kcal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weights (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  weight REAL NOT NULL
);
```

## Running the Application

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

## License

OpenMacros is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.

## Collaboration and Pull Requests

Contributions are welcome. If you want to collaborate, please open an issue first for larger changes so the approach can be discussed before work begins.

Pull requests should:

*   Clearly describe the change and why it is needed.
*   Keep the scope focused and consistent with the existing code style.
*   Include any relevant testing notes or screenshots when applicable.
