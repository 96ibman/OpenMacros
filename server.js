const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { dbQuery, dbGet, dbRun, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to generate simple IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Default seed database if totally empty
async function seedDefaults() {
  const item1Id = 'item-e0ld18ebn';
  const item2Id = 'item-503ofoz4e';
  
  const ing1Id = 'ing-snra0eslj';
  const ing2Id = 'ing-fahtey9ti';

  const meal1Id = 'meal-rrcgntv7d';

  await dbRun("BEGIN TRANSACTION");

  await dbRun("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [item1Id, 'Raw Boneless Skinless Chicken Breast', 100, 'Grams', 23, 1.24, 0, 103.16]);
  await dbRun("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [item2Id, 'ALDI Penne Pasta', 100, 'Grams', 12, 1.3, 72, 347.7]);

  await dbRun("INSERT INTO ingredients VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ing1Id, 'Breast(1k)', item1Id, 1000, 230, 12.4, 0, 1031.6]);
  await dbRun("INSERT INTO ingredients VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ing2Id, 'Pasta(500g)', item2Id, 500, 60, 6.5, 360, 1738.5]);

  await dbRun("INSERT INTO meals VALUES (?, ?, ?, ?, ?, ?)", [meal1Id, 'Simple Chicken Pasta Meal', 290, 18.9, 360, 2770.1]);
  await dbRun("INSERT INTO meal_ingredients VALUES (?, ?)", [meal1Id, ing1Id]);
  await dbRun("INSERT INTO meal_ingredients VALUES (?, ?)", [meal1Id, ing2Id]);

  await dbRun("INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ['log-1', '30-Jun-26', 'meal', meal1Id, 'Simple Chicken Pasta Meal', 0.2, 58, 3.78, 72, 554.02]);

  await dbRun("INSERT INTO goals VALUES (1, 150, 70, 200, 2030)");
  await dbRun("INSERT INTO settings VALUES ('activeDate', '30-Jun-26')");

  await dbRun("COMMIT");
}

// REST API Endpoints

// 1. Get entire database state
app.get('/api/db', async (req, res) => {
  try {
    const [items, ingredients, meals, meal_ingredients, logs, goals, settings, weights] = await Promise.all([
      dbQuery("SELECT * FROM items"),
      dbQuery("SELECT * FROM ingredients"),
      dbQuery("SELECT * FROM meals"),
      dbQuery("SELECT * FROM meal_ingredients"),
      dbQuery("SELECT * FROM logs"),
      dbQuery("SELECT * FROM goals WHERE id = 1"),
      dbQuery("SELECT * FROM settings"),
      dbQuery("SELECT * FROM weights ORDER BY month ASC")
    ]);

    const mealIngsMap = {};
    meal_ingredients.forEach(mi => {
      if (!mealIngsMap[mi.mealId]) mealIngsMap[mi.mealId] = [];
      mealIngsMap[mi.mealId].push(mi.ingredientId);
    });
    meals.forEach(m => {
      m.ingredientIds = mealIngsMap[m.id] || [];
    });

    const goalData = goals[0] ? {
      protein: goals[0].protein,
      fat: goals[0].fat,
      carbs: goals[0].carbs,
      kcal: goals[0].kcal
    } : { protein: 150, fat: 70, carbs: 200, kcal: 2030 };

    const activeDateObj = settings.find(s => s.key === 'activeDate');
    const activeDate = activeDateObj ? activeDateObj.value : '30-Jun-26';

    res.json({
      items,
      ingredients,
      meals,
      logs,
      goals: goalData,
      activeDate,
      weights: weights || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read database', details: err.message });
  }
});

// 2. Save entire database state (fallback fallback if frontend syncs full state)
app.post('/api/db', async (req, res) => {
  try {
    const dbData = req.body;
    await dbRun("BEGIN TRANSACTION");
    
    await dbRun("DELETE FROM items");
    await dbRun("DELETE FROM ingredients");
    await dbRun("DELETE FROM meals");
    await dbRun("DELETE FROM meal_ingredients");
    await dbRun("DELETE FROM logs");
    await dbRun("DELETE FROM goals");
    await dbRun("DELETE FROM settings");
    await dbRun("DELETE FROM weights");

    if (dbData.items) {
      for (const item of dbData.items) {
        await dbRun("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
          [item.id, item.name, item.baseQuantity, item.unit, item.protein, item.fat, item.carbs, item.kcal]);
      }
    }
    if (dbData.ingredients) {
      for (const ing of dbData.ingredients) {
        await dbRun("INSERT INTO ingredients VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
          [ing.id, ing.name, ing.itemId, ing.amount, ing.protein, ing.fat, ing.carbs, ing.kcal]);
      }
    }
    if (dbData.meals) {
      for (const meal of dbData.meals) {
        await dbRun("INSERT INTO meals VALUES (?, ?, ?, ?, ?, ?)", 
          [meal.id, meal.name, meal.protein, meal.fat, meal.carbs, meal.kcal]);
        if (meal.ingredientIds) {
          for (const ingId of meal.ingredientIds) {
            await dbRun("INSERT OR IGNORE INTO meal_ingredients (mealId, ingredientId) VALUES (?, ?)", 
              [meal.id, ingId]);
          }
        }
      }
    }
    if (dbData.logs) {
      for (const log of dbData.logs) {
        await dbRun("INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
          [log.id, log.date, log.type, log.referenceId, log.name, log.amount, log.protein, log.fat, log.carbs, log.kcal]);
      }
    }
    if (dbData.goals) {
      await dbRun("INSERT INTO goals VALUES (1, ?, ?, ?, ?)", 
        [dbData.goals.protein, dbData.goals.fat, dbData.goals.carbs, dbData.goals.kcal]);
    }
    if (dbData.activeDate) {
      await dbRun("INSERT INTO settings VALUES ('activeDate', ?)", [dbData.activeDate]);
    }
    if (dbData.weights) {
      for (const wt of dbData.weights) {
        await dbRun("INSERT INTO weights VALUES (?, ?, ?)", [wt.id, wt.month, wt.weight]);
      }
    }

    await dbRun("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to save database', details: err.message });
  }
});

// 3. Update goals
app.put('/api/goals', async (req, res) => {
  try {
    const { protein, fat, carbs } = req.body;
    const p = Number(protein) || 0;
    const f = Number(fat) || 0;
    const c = Number(carbs) || 0;
    const kcal = p * 4 + f * 9 + c * 4;

    await dbRun(
      "INSERT OR REPLACE INTO goals (id, protein, fat, carbs, kcal) VALUES (1, ?, ?, ?, ?)",
      [p, f, c, kcal]
    );
    res.json({ protein: p, fat: f, carbs: c, kcal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update goals', details: err.message });
  }
});

// 4. Update active date
app.post('/api/active-date', async (req, res) => {
  try {
    const { date } = req.body;
    if (date) {
      await dbRun(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('activeDate', ?)",
        [date]
      );
    }
    const activeDateObj = await dbGet("SELECT value FROM settings WHERE key = 'activeDate'");
    res.json({ activeDate: activeDateObj ? activeDateObj.value : '30-Jun-26' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update active date', details: err.message });
  }
});

// --- Items CRUD ---
app.post('/api/items', async (req, res) => {
  try {
    const item = {
      id: 'item-' + generateId(),
      name: req.body.name || 'Unnamed Item',
      baseQuantity: Number(req.body.baseQuantity) || 100,
      unit: req.body.unit || 'Grams',
      protein: Number(req.body.protein) || 0,
      fat: Number(req.body.fat) || 0,
      carbs: Number(req.body.carbs) || 0,
    };
    item.kcal = item.protein * 4 + item.fat * 9 + item.carbs * 4;

    await dbRun(
      "INSERT INTO items (id, name, baseQuantity, unit, protein, fat, carbs, kcal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.name, item.baseQuantity, item.unit, item.protein, item.fat, item.carbs, item.kcal]
    );
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create item', details: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    await dbRun("BEGIN TRANSACTION");
    
    const item = await dbGet("SELECT * FROM items WHERE id = ?", [req.params.id]);
    if (!item) {
      await dbRun("ROLLBACK");
      return res.status(404).json({ error: 'Item not found' });
    }

    const updated = {
      ...item,
      name: req.body.name !== undefined ? req.body.name : item.name,
      baseQuantity: req.body.baseQuantity !== undefined ? Number(req.body.baseQuantity) : item.baseQuantity,
      unit: req.body.unit !== undefined ? req.body.unit : item.unit,
      protein: req.body.protein !== undefined ? Number(req.body.protein) : item.protein,
      fat: req.body.fat !== undefined ? Number(req.body.fat) : item.fat,
      carbs: req.body.carbs !== undefined ? Number(req.body.carbs) : item.carbs,
    };
    updated.kcal = updated.protein * 4 + updated.fat * 9 + updated.carbs * 4;

    // 1. Update the item
    await dbRun(
      "UPDATE items SET name = ?, baseQuantity = ?, unit = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
      [updated.name, updated.baseQuantity, updated.unit, updated.protein, updated.fat, updated.carbs, updated.kcal, updated.id]
    );

    // 2. Cascade update to ingredients referencing this item
    const ingredients = await dbQuery("SELECT * FROM ingredients WHERE itemId = ?", [updated.id]);
    for (const ing of ingredients) {
      const ratio = ing.amount / updated.baseQuantity;
      ing.protein = Number((updated.protein * ratio).toFixed(2));
      ing.fat = Number((updated.fat * ratio).toFixed(2));
      ing.carbs = Number((updated.carbs * ratio).toFixed(2));
      ing.kcal = Number((updated.kcal * ratio).toFixed(2));

      await dbRun(
        "UPDATE ingredients SET protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
        [ing.protein, ing.fat, ing.carbs, ing.kcal, ing.id]
      );
    }

    // 3. Recalculate totals for meals using those ingredients
    const meals = await dbQuery("SELECT * FROM meals");
    const mealIngredients = await dbQuery("SELECT * FROM meal_ingredients");
    
    const mealIngsMap = {};
    mealIngredients.forEach(mi => {
      if (!mealIngsMap[mi.mealId]) mealIngsMap[mi.mealId] = [];
      mealIngsMap[mi.mealId].push(mi.ingredientId);
    });

    for (const meal of meals) {
      const ingIds = mealIngsMap[meal.id] || [];
      let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;
      let needsUpdate = false;

      for (const ingId of ingIds) {
        const ing = await dbGet("SELECT * FROM ingredients WHERE id = ?", [ingId]);
        if (ing) {
          mProt += ing.protein;
          mFat += ing.fat;
          mCarb += ing.carbs;
          mKcal += ing.kcal;
          
          if (ing.itemId === updated.id) {
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        meal.protein = Number(mProt.toFixed(2));
        meal.fat = Number(mFat.toFixed(2));
        meal.carbs = Number(mCarb.toFixed(2));
        meal.kcal = Number(mKcal.toFixed(2));

        await dbRun(
          "UPDATE meals SET protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
          [meal.protein, meal.fat, meal.carbs, meal.kcal, meal.id]
        );
      }
    }

    // 4. Update logged entries referring to this item/meals containing this item
    const logs = await dbQuery("SELECT * FROM logs");
    for (const log of logs) {
      if (log.type === 'item' && log.referenceId === updated.id) {
        const ratio = log.amount / updated.baseQuantity;
        log.name = updated.name;
        log.protein = Number((updated.protein * ratio).toFixed(2));
        log.fat = Number((updated.fat * ratio).toFixed(2));
        log.carbs = Number((updated.carbs * ratio).toFixed(2));
        log.kcal = Number((updated.kcal * ratio).toFixed(2));

        await dbRun(
          "UPDATE logs SET name = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
          [log.name, log.protein, log.fat, log.carbs, log.kcal, log.id]
        );
      } else if (log.type === 'meal') {
        const meal = await dbGet("SELECT * FROM meals WHERE id = ?", [log.referenceId]);
        if (meal) {
          log.name = meal.name;
          log.protein = Number((meal.protein * log.amount).toFixed(2));
          log.fat = Number((meal.fat * log.amount).toFixed(2));
          log.carbs = Number((meal.carbs * log.amount).toFixed(2));
          log.kcal = Number((meal.kcal * log.amount).toFixed(2));

          await dbRun(
            "UPDATE logs SET name = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
            [log.name, log.protein, log.fat, log.carbs, log.kcal, log.id]
          );
        }
      }
    }

    await dbRun("COMMIT");
    res.json(updated);
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to update item', details: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    // ON DELETE CASCADE automatically deletes ingredients referencing this item
    await dbRun("DELETE FROM items WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item', details: err.message });
  }
});

// --- Ingredients CRUD ---
app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, itemId, amount } = req.body;
    const item = await dbGet("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const ratio = Number(amount) / item.baseQuantity;
    const ingredient = {
      id: 'ing-' + generateId(),
      name: name || `${item.name} (${amount}${item.unit === 'Grams' ? 'g' : ''})`,
      itemId,
      amount: Number(amount),
      protein: Number((item.protein * ratio).toFixed(2)),
      fat: Number((item.fat * ratio).toFixed(2)),
      carbs: Number((item.carbs * ratio).toFixed(2)),
      kcal: Number((item.kcal * ratio).toFixed(2))
    };

    await dbRun(
      "INSERT INTO ingredients (id, name, itemId, amount, protein, fat, carbs, kcal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [ingredient.id, ingredient.name, ingredient.itemId, ingredient.amount, ingredient.protein, ingredient.fat, ingredient.carbs, ingredient.kcal]
    );
    res.status(201).json(ingredient);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ingredient', details: err.message });
  }
});

app.put('/api/ingredients/:id', async (req, res) => {
  try {
    await dbRun("BEGIN TRANSACTION");

    const existing = await dbGet("SELECT * FROM ingredients WHERE id = ?", [req.params.id]);
    if (!existing) {
      await dbRun("ROLLBACK");
      return res.status(404).json({ error: 'Ingredient not found' });
    }

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : existing.amount;
    const itemId = req.body.itemId !== undefined ? req.body.itemId : existing.itemId;

    const item = await dbGet("SELECT * FROM items WHERE id = ?", [itemId]);
    if (!item) {
      await dbRun("ROLLBACK");
      return res.status(404).json({ error: 'Item not found' });
    }

    const ratio = amount / item.baseQuantity;
    const updated = {
      id: existing.id,
      name,
      itemId,
      amount,
      protein: Number((item.protein * ratio).toFixed(2)),
      fat: Number((item.fat * ratio).toFixed(2)),
      carbs: Number((item.carbs * ratio).toFixed(2)),
      kcal: Number((item.kcal * ratio).toFixed(2))
    };

    await dbRun(
      "UPDATE ingredients SET name = ?, itemId = ?, amount = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
      [updated.name, updated.itemId, updated.amount, updated.protein, updated.fat, updated.carbs, updated.kcal, updated.id]
    );

    // Recalculate meals containing this ingredient
    const meals = await dbQuery("SELECT * FROM meals");
    const mealIngredients = await dbQuery("SELECT * FROM meal_ingredients");
    
    const mealIngsMap = {};
    mealIngredients.forEach(mi => {
      if (!mealIngsMap[mi.mealId]) mealIngsMap[mi.mealId] = [];
      mealIngsMap[mi.mealId].push(mi.ingredientId);
    });

    for (const meal of meals) {
      const ingIds = mealIngsMap[meal.id] || [];
      if (ingIds.includes(updated.id)) {
        let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;
        for (const ingId of ingIds) {
          const ing = ingId === updated.id ? updated : await dbGet("SELECT * FROM ingredients WHERE id = ?", [ingId]);
          if (ing) {
            mProt += ing.protein;
            mFat += ing.fat;
            mCarb += ing.carbs;
            mKcal += ing.kcal;
          }
        }

        meal.protein = Number(mProt.toFixed(2));
        meal.fat = Number(mFat.toFixed(2));
        meal.carbs = Number(mCarb.toFixed(2));
        meal.kcal = Number(mKcal.toFixed(2));

        await dbRun(
          "UPDATE meals SET protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
          [meal.protein, meal.fat, meal.carbs, meal.kcal, meal.id]
        );

        // Update logged meals referencing this meal
        const logs = await dbQuery("SELECT * FROM logs WHERE type = 'meal' AND referenceId = ?", [meal.id]);
        for (const log of logs) {
          log.protein = Number((meal.protein * log.amount).toFixed(2));
          log.fat = Number((meal.fat * log.amount).toFixed(2));
          log.carbs = Number((meal.carbs * log.amount).toFixed(2));
          log.kcal = Number((meal.kcal * log.amount).toFixed(2));

          await dbRun(
            "UPDATE logs SET protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
            [log.protein, log.fat, log.carbs, log.kcal, log.id]
          );
        }
      }
    }

    await dbRun("COMMIT");
    res.json(updated);
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to update ingredient', details: err.message });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    await dbRun("BEGIN TRANSACTION");

    // Deleting from ingredients deletes from meal_ingredients via cascade
    await dbRun("DELETE FROM ingredients WHERE id = ?", [req.params.id]);

    // Recalculate meals that contained this ingredient
    const meals = await dbQuery("SELECT * FROM meals");
    const mealIngredients = await dbQuery("SELECT * FROM meal_ingredients");
    
    const mealIngsMap = {};
    mealIngredients.forEach(mi => {
      if (!mealIngsMap[mi.mealId]) mealIngsMap[mi.mealId] = [];
      mealIngsMap[mi.mealId].push(mi.ingredientId);
    });

    for (const meal of meals) {
      const ingIds = mealIngsMap[meal.id] || [];
      let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;
      for (const ingId of ingIds) {
        const ing = await dbGet("SELECT * FROM ingredients WHERE id = ?", [ingId]);
        if (ing) {
          mProt += ing.protein;
          mFat += ing.fat;
          mCarb += ing.carbs;
          mKcal += ing.kcal;
        }
      }

      meal.protein = Number(mProt.toFixed(2));
      meal.fat = Number(mFat.toFixed(2));
      meal.carbs = Number(mCarb.toFixed(2));
      meal.kcal = Number(mKcal.toFixed(2));

      await dbRun(
        "UPDATE meals SET protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
        [meal.protein, meal.fat, meal.carbs, meal.kcal, meal.id]
      );
    }

    await dbRun("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to delete ingredient', details: err.message });
  }
});

// --- Meals CRUD ---
app.post('/api/meals', async (req, res) => {
  try {
    await dbRun("BEGIN TRANSACTION");
    const { name, ingredientIds } = req.body;

    let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;
    const ingIds = ingredientIds || [];

    for (const ingId of ingIds) {
      const ing = await dbGet("SELECT * FROM ingredients WHERE id = ?", [ingId]);
      if (ing) {
        mProt += ing.protein;
        mFat += ing.fat;
        mCarb += ing.carbs;
        mKcal += ing.kcal;
      }
    }

    const meal = {
      id: 'meal-' + generateId(),
      name: name || 'Unnamed Meal',
      protein: Number(mProt.toFixed(2)),
      fat: Number(mFat.toFixed(2)),
      carbs: Number(mCarb.toFixed(2)),
      kcal: Number(mKcal.toFixed(2))
    };

    await dbRun(
      "INSERT INTO meals (id, name, protein, fat, carbs, kcal) VALUES (?, ?, ?, ?, ?, ?)",
      [meal.id, meal.name, meal.protein, meal.fat, meal.carbs, meal.kcal]
    );

    for (const ingId of ingIds) {
      await dbRun(
        "INSERT INTO meal_ingredients (mealId, ingredientId) VALUES (?, ?)",
        [meal.id, ingId]
      );
    }

    await dbRun("COMMIT");
    meal.ingredientIds = ingIds;
    res.status(201).json(meal);
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to create meal', details: err.message });
  }
});

app.put('/api/meals/:id', async (req, res) => {
  try {
    await dbRun("BEGIN TRANSACTION");

    const existing = await dbGet("SELECT * FROM meals WHERE id = ?", [req.params.id]);
    if (!existing) {
      await dbRun("ROLLBACK");
      return res.status(404).json({ error: 'Meal not found' });
    }

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    let ingredientIds = req.body.ingredientIds;
    if (ingredientIds === undefined) {
      const rows = await dbQuery("SELECT ingredientId FROM meal_ingredients WHERE mealId = ?", [existing.id]);
      ingredientIds = rows.map(r => r.ingredientId);
    }

    let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;
    for (const ingId of ingredientIds) {
      const ing = await dbGet("SELECT * FROM ingredients WHERE id = ?", [ingId]);
      if (ing) {
        mProt += ing.protein;
        mFat += ing.fat;
        mCarb += ing.carbs;
        mKcal += ing.kcal;
      }
    }

    const updated = {
      id: existing.id,
      name,
      protein: Number(mProt.toFixed(2)),
      fat: Number(mFat.toFixed(2)),
      carbs: Number(mCarb.toFixed(2)),
      kcal: Number(mKcal.toFixed(2))
    };

    await dbRun(
      "UPDATE meals SET name = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
      [updated.name, updated.protein, updated.fat, updated.carbs, updated.kcal, updated.id]
    );

    await dbRun("DELETE FROM meal_ingredients WHERE mealId = ?", [updated.id]);
    for (const ingId of ingredientIds) {
      await dbRun(
        "INSERT INTO meal_ingredients (mealId, ingredientId) VALUES (?, ?)",
        [updated.id, ingId]
      );
    }

    // Update logged meals referencing this meal
    const logs = await dbQuery("SELECT * FROM logs WHERE type = 'meal' AND referenceId = ?", [updated.id]);
    for (const log of logs) {
      log.name = updated.name;
      log.protein = Number((updated.protein * log.amount).toFixed(2));
      log.fat = Number((updated.fat * log.amount).toFixed(2));
      log.carbs = Number((updated.carbs * log.amount).toFixed(2));
      log.kcal = Number((updated.kcal * log.amount).toFixed(2));

      await dbRun(
        "UPDATE logs SET name = ?, protein = ?, fat = ?, carbs = ?, kcal = ? WHERE id = ?",
        [log.name, log.protein, log.fat, log.carbs, log.kcal, log.id]
      );
    }

    await dbRun("COMMIT");
    updated.ingredientIds = ingredientIds;
    res.json(updated);
  } catch (err) {
    await dbRun("ROLLBACK").catch(() => {});
    res.status(500).json({ error: 'Failed to update meal', details: err.message });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    // ON DELETE CASCADE automatically deletes meal_ingredients referencing this meal
    await dbRun("DELETE FROM meals WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meal', details: err.message });
  }
});

// --- Logs CRUD ---
app.post('/api/logs', async (req, res) => {
  try {
    const { type, referenceId, amount, date } = req.body;

    let logName = '';
    let mProt = 0, mFat = 0, mCarb = 0, mKcal = 0;

    if (type === 'item') {
      const item = await dbGet("SELECT * FROM items WHERE id = ?", [referenceId]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      logName = item.name;
      const ratio = Number(amount) / item.baseQuantity;
      mProt = item.protein * ratio;
      mFat = item.fat * ratio;
      mCarb = item.carbs * ratio;
      mKcal = item.kcal * ratio;
    } else if (type === 'meal') {
      const meal = await dbGet("SELECT * FROM meals WHERE id = ?", [referenceId]);
      if (!meal) return res.status(404).json({ error: 'Meal not found' });
      logName = meal.name;
      const ratio = Number(amount);
      mProt = meal.protein * ratio;
      mFat = meal.fat * ratio;
      mCarb = meal.carbs * ratio;
      mKcal = meal.kcal * ratio;
    } else {
      return res.status(400).json({ error: 'Invalid log type' });
    }

    let dateValue = date;
    if (!dateValue) {
      const activeDateObj = await dbGet("SELECT value FROM settings WHERE key = 'activeDate'");
      dateValue = activeDateObj ? activeDateObj.value : '30-Jun-26';
    }

    const logEntry = {
      id: 'log-' + generateId(),
      date: dateValue,
      type,
      referenceId,
      name: logName,
      amount: Number(amount),
      protein: Number(mProt.toFixed(2)),
      fat: Number(mFat.toFixed(2)),
      carbs: Number(mCarb.toFixed(2)),
      kcal: Number(mKcal.toFixed(2))
    };

    await dbRun(
      "INSERT INTO logs (id, date, type, referenceId, name, amount, protein, fat, carbs, kcal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [logEntry.id, logEntry.date, logEntry.type, logEntry.referenceId, logEntry.name, logEntry.amount, logEntry.protein, logEntry.fat, logEntry.carbs, logEntry.kcal]
    );

    res.status(201).json(logEntry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create log entry', details: err.message });
  }
});

app.delete('/api/logs/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM logs WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete log entry', details: err.message });
  }
});

// --- Weights CRUD ---
app.post('/api/weights', async (req, res) => {
  try {
    const { month, weight } = req.body;
    if (!month || weight === undefined || weight === null) {
      return res.status(400).json({ error: 'Month and weight are required' });
    }

    const existing = await dbGet("SELECT id FROM weights WHERE month = ?", [month]);
    const id = existing ? existing.id : 'wt-' + generateId();
    const weightVal = Number(weight);

    await dbRun(
      "INSERT OR REPLACE INTO weights (id, month, weight) VALUES (?, ?, ?)",
      [id, month, weightVal]
    );

    res.status(201).json({ id, month, weight: weightVal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save weight', details: err.message });
  }
});

app.delete('/api/weights/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM weights WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete weight', details: err.message });
  }
});

// --- Start express app and SQLite database ---
async function startServer() {
  try {
    // 1. Initialize SQLite schema
    await initDb();
    console.log('SQLite database schema initialized successfully.');

    // 2. Seed default items if the SQLite database is fresh and completely empty
    const itemCheck = await dbQuery("SELECT COUNT(*) as count FROM items");
    if (itemCheck[0].count === 0) {
      console.log("SQLite database is empty. Seeding default setup...");
      await seedDefaults();
      console.log("Default database seeded successfully.");
    }

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
