// AuraMacros App State
let state = {
  items: [],
  ingredients: [],
  meals: [],
  logs: [],
  weights: [],
  goals: { protein: 150, fat: 70, carbs: 200, kcal: 2030 },
  activeDate: '',
  currentTab: 'dashboard',
  logType: 'item' // 'item' or 'meal'
};

// Global variables for modals & delete callbacks
let deleteCallback = null;
let currentEditingMealId = null;

// API Base URL
const API_BASE = '/api';

// Date utility to format dates like "30-Jun-26"
function getFormattedDate(dateObj) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = dateObj.getDate();
  const month = months[dateObj.getMonth()];
  const year = String(dateObj.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Show Toast notifications
function showToast(message, type = 'success') {
  const area = document.getElementById('toast-area');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-weight:600">${type === 'success' ? '✓' : '⚠'}</span>
    <span>${message}</span>
  `;
  area.appendChild(toast);
  
  // Auto remove toast from DOM
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Fetch all database state
async function fetchState() {
  try {
    const res = await fetch(`${API_BASE}/db`);
    if (!res.ok) throw new Error('API server returned error');
    const data = await res.json();
    state = { ...state, ...data };
    if (!state.weights) state.weights = [];
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('Failed to load data from backend server', 'error');
  }
}

// Sync changes to backend (for complex mutations if needed, otherwise CRUD endpoints handle it)
async function syncDb() {
  try {
    const res = await fetch(`${API_BASE}/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('Sync failed');
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('Failed to save data on server', 'error');
  }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupEventListeners();
  setupCustomDropdowns();
  fetchState();
});

// Setup sidebar tab selection
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const targetTab = link.getAttribute('data-tab');
      state.currentTab = targetTab;

      // Toggle active sections
      document.querySelectorAll('.dashboard-section').forEach(sec => {
        sec.classList.remove('active');
      });
      const activeSection = document.getElementById(`${targetTab}-section`);
      if (activeSection) {
        activeSection.classList.add('active');
      }

      renderTab(targetTab);
    });
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Goal Target editor form
  document.getElementById('goals-editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const protein = Number(document.getElementById('goal-p-input').value);
    const fat = Number(document.getElementById('goal-f-input').value);
    const carbs = Number(document.getElementById('goal-c-input').value);

    try {
      const res = await fetch(`${API_BASE}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protein, fat, carbs })
      });
      if (res.ok) {
        state.goals = await res.json();
        showToast('Daily target goals updated!');
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating goals', 'error');
    }
  });

  // Log food form submit
  document.getElementById('log-food-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = state.logType;
    const refId = type === 'item' 
      ? document.getElementById('log-item-select').value 
      : document.getElementById('log-meal-select').value;
    const amount = Number(document.getElementById('log-amount').value);

    if (!refId) {
      showToast('Please select a food item or meal', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          referenceId: refId,
          amount,
          date: state.activeDate
        })
      });
      if (res.ok) {
        const newLog = await res.json();
        state.logs.push(newLog);
        document.getElementById('log-food-form').reset();
        document.getElementById('log-item-select').value = '';
        document.getElementById('log-meal-select').value = '';
        document.getElementById('log-item-search').value = '';
        document.getElementById('log-meal-search').value = '';
        updateLogFormHints();
        showToast('Consumption logged successfully!');
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error logging consumption', 'error');
    }
  });

  // Track new day button click
  document.getElementById('track-new-day-btn').addEventListener('click', async () => {
    const todayStr = getFormattedDate(new Date());
    try {
      const res = await fetch(`${API_BASE}/active-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr })
      });
      if (res.ok) {
        const data = await res.json();
        state.activeDate = data.activeDate;
        showToast(`Tracking day initialized: ${state.activeDate}`);
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating active tracking date', 'error');
    }
  });

  // Search filter event listeners
  document.getElementById('search-logs').addEventListener('input', () => renderIntakeLogsTable());
  document.getElementById('search-items').addEventListener('input', () => renderFoodItemsTable());
  document.getElementById('search-ingredients').addEventListener('input', () => renderIngredientsTable());
  document.getElementById('search-meals').addEventListener('input', () => renderMealsGrid());
  document.getElementById('search-history').addEventListener('input', () => renderHistoryCards());
  
  // Search filter for ingredients inside Compose Meal Modal
  document.getElementById('meal-ing-search').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.meal-ing-checkbox-row');
    rows.forEach(row => {
      const name = row.querySelector('div > div').innerText.toLowerCase();
      if (name.includes(query)) {
        row.style.display = 'flex';
      } else {
        row.style.display = 'none';
      }
    });
  });

  // Meal Form Compose Submit
  document.getElementById('meal-form').addEventListener('submit', handleMealFormSubmit);

  // Delete modal confirm button click
  document.getElementById('confirm-delete-btn').addEventListener('click', () => {
    if (deleteCallback) {
      deleteCallback();
      closeDeleteModal();
    }
  });

  // Weight form submit
  const weightForm = document.getElementById('weight-form');
  if (weightForm) {
    weightForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const month = document.getElementById('weight-month').value;
      const weight = Number(document.getElementById('weight-value').value);

      try {
        const res = await fetch(`${API_BASE}/weights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, weight })
        });
        if (res.ok) {
          const newWeight = await res.json();
          const existingIdx = state.weights.findIndex(w => w.month === month);
          if (existingIdx !== -1) {
            state.weights[existingIdx] = newWeight;
          } else {
            state.weights.push(newWeight);
          }
          state.weights.sort((a, b) => a.month.localeCompare(b.month));
          
          weightForm.reset();
          showToast('Weight logged successfully!');
          renderAll();
        } else {
          const errData = await res.json();
          showToast(errData.error || 'Failed to save weight', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error saving weight', 'error');
      }
    });
  }
}

// Master Render functions
function renderAll() {
  // Update Header displaying active date
  document.getElementById('active-day-display').innerText = state.activeDate || 'Not Set';
  
  // Populate Goals Inputs
  document.getElementById('goal-p-input').value = state.goals.protein;
  document.getElementById('goal-f-input').value = state.goals.fat;
  document.getElementById('goal-c-input').value = state.goals.carbs;

  // Render the current active tab
  renderTab(state.currentTab);
}

// Render active tab contents
function renderTab(tab) {
  switch (tab) {
    case 'dashboard':
      renderGoalsDashboard();
      renderIntakeLogsTable();
      populateIntakeSelects();
      break;
    case 'items':
      renderFoodItemsTable();
      break;
    case 'ingredients':
      renderIngredientsTable();
      populateIngredientItemSelect();
      break;
    case 'meals':
      renderMealsGrid();
      break;
    case 'history':
      renderHistoryCards();
      break;
    case 'weight':
      renderWeightTracker();
      break;
    case 'goals':
      // Form values are updated globally in renderAll()
      break;
  }
}

// ----------------------------------------------------
// 1. DASHBOARD AND LOGS VIEW
// ----------------------------------------------------

function renderGoalsDashboard() {
  // Filter logs for today
  const todaysLogs = state.logs.filter(log => log.date === state.activeDate);
  
  // Sum macros consumed today
  const consumed = todaysLogs.reduce((acc, log) => {
    acc.p += log.protein || 0;
    acc.f += log.fat || 0;
    acc.c += log.carbs || 0;
    acc.kcal += log.kcal || 0;
    return acc;
  }, { p: 0, f: 0, c: 0, kcal: 0 });

  // Round values
  consumed.p = Number(consumed.p.toFixed(1));
  consumed.f = Number(consumed.f.toFixed(1));
  consumed.c = Number(consumed.c.toFixed(1));
  consumed.kcal = Number(consumed.kcal.toFixed(1));

  const goals = state.goals;

  // Compute Remaining values
  const rem = {
    p: Math.max(0, Number((goals.protein - consumed.p).toFixed(1))),
    f: Math.max(0, Number((goals.fat - consumed.f).toFixed(1))),
    c: Math.max(0, Number((goals.carbs - consumed.c).toFixed(1))),
    kcal: Math.max(0, Number((goals.kcal - consumed.kcal).toFixed(1)))
  };

  // Populate HTML elements
  document.getElementById('p-consumed').innerText = consumed.p;
  document.getElementById('p-goal').innerText = goals.protein;
  document.getElementById('p-remaining').innerText = rem.p;
  
  document.getElementById('f-consumed').innerText = consumed.f;
  document.getElementById('f-goal').innerText = goals.fat;
  document.getElementById('f-remaining').innerText = rem.f;

  document.getElementById('c-consumed').innerText = consumed.c;
  document.getElementById('c-goal').innerText = goals.carbs;
  document.getElementById('c-remaining').innerText = rem.c;

  document.getElementById('k-consumed').innerText = Math.round(consumed.kcal);
  document.getElementById('k-goal').innerText = Math.round(goals.kcal);
  document.getElementById('k-remaining').innerText = Math.round(rem.kcal);

  // Compute and set progress bar percentage width
  const pct = {
    p: Math.min(100, (consumed.p / goals.protein) * 100),
    f: Math.min(100, (consumed.f / goals.fat) * 100),
    c: Math.min(100, (consumed.c / goals.carbs) * 100),
    kcal: Math.min(100, (consumed.kcal / goals.kcal) * 100),
  };

  document.getElementById('p-progress').style.width = `${pct.p}%`;
  document.getElementById('f-progress').style.width = `${pct.f}%`;
  document.getElementById('c-progress').style.width = `${pct.c}%`;
  document.getElementById('k-progress').style.width = `${pct.kcal}%`;
}

function renderIntakeLogsTable() {
  const list = document.getElementById('logs-list');
  list.innerHTML = '';

  const searchVal = document.getElementById('search-logs').value.toLowerCase();
  
  // Filter for logs matching the active date
  const filtered = state.logs
    .filter(log => log.date === state.activeDate)
    .filter(log => {
      return log.name.toLowerCase().includes(searchVal) || 
             log.type.toLowerCase().includes(searchVal);
    });

  if (filtered.length === 0) {
    list.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted)">No food logged yet for this day.</td></tr>`;
    return;
  }

  filtered.forEach(log => {
    const tr = document.createElement('tr');
    
    // Format amount label
    let amountDisplay = '';
    if (log.type === 'item') {
      const item = state.items.find(i => i.id === log.referenceId);
      const unit = item ? item.unit : '';
      amountDisplay = `${log.amount} ${unit}`;
    } else {
      amountDisplay = `${(log.amount * 100).toFixed(0)}% portion`;
    }

    tr.innerHTML = `
      <td><span style="font-size:0.75rem; text-transform:uppercase; background:rgba(255,255,255,0.06); padding:0.25rem 0.5rem; border-radius:4px">${log.type}</span></td>
      <td><strong>${log.name}</strong></td>
      <td>${amountDisplay}</td>
      <td style="color:var(--color-protein); font-weight:600">${log.protein}g</td>
      <td style="color:var(--color-fat); font-weight:600">${log.fat}g</td>
      <td style="color:var(--color-carbs); font-weight:600">${log.carbs}g</td>
      <td style="color:var(--color-kcal); font-weight:700">${log.kcal} kcal</td>
      <td>
        <div class="table-actions">
          <button class="action-btn delete-btn" onclick="deleteLogEntry('${log.id}', '${log.name}')">
            <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>
      </td>
    `;
    list.appendChild(tr);
  });
}

function switchLogType(type) {
  state.logType = type;
  document.getElementById('type-tab-item').classList.toggle('active', type === 'item');
  document.getElementById('type-tab-meal').classList.toggle('active', type === 'meal');

  document.getElementById('log-item-select-group').style.display = type === 'item' ? 'block' : 'none';
  document.getElementById('log-meal-select-group').style.display = type === 'meal' ? 'block' : 'none';

  // Clear inputs and selections
  document.getElementById('log-item-select').value = '';
  document.getElementById('log-meal-select').value = '';
  document.getElementById('log-item-search').value = '';
  document.getElementById('log-meal-search').value = '';

  // Close open lists
  closeAllDropdownsExcept('');

  updateLogFormHints();
}

function populateIntakeSelects() {
  // Overridden: using dynamic searchable list now. Just reset selections.
  document.getElementById('log-item-select').value = '';
  document.getElementById('log-meal-select').value = '';
  document.getElementById('log-item-search').value = '';
  document.getElementById('log-meal-search').value = '';
  updateLogFormHints();
}

function updateLogFormHints() {
  const label = document.getElementById('log-amount-label');
  const hint = document.getElementById('log-amount-hint');
  const amountInput = document.getElementById('log-amount');

  if (state.logType === 'item') {
    const itemId = document.getElementById('log-item-select').value;
    const item = state.items.find(i => i.id === itemId);
    
    if (item) {
      label.innerText = `Amount (${item.unit})`;
      amountInput.placeholder = `e.g. ${item.baseQuantity}`;
      hint.innerText = `Base quantity: ${item.baseQuantity} ${item.unit} | Macros: P:${item.protein} F:${item.fat} C:${item.carbs}`;
    } else {
      label.innerText = 'Amount';
      amountInput.placeholder = 'Select an item';
      hint.innerText = '';
    }
  } else {
    label.innerText = 'Portion Multiplier';
    amountInput.placeholder = 'e.g. 1.0 (Full), 0.5 (Half), 0.2 (20%)';
    hint.innerText = 'Enter portion percentage multiplier (e.g. 1 is full recipe, 0.5 is half)';
  }
}

function deleteLogEntry(id, name) {
  openDeleteModal(name, async () => {
    try {
      const res = await fetch(`${API_BASE}/logs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.logs = state.logs.filter(l => l.id !== id);
        showToast(`Intake log for ${name} deleted.`);
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting log', 'error');
    }
  });
}

// ----------------------------------------------------
// 2. FOOD LIBRARY VIEW (ITEMS)
// ----------------------------------------------------

function renderFoodItemsTable() {
  const tbody = document.getElementById('items-list-body');
  tbody.innerHTML = '';

  const searchVal = document.getElementById('search-items').value.toLowerCase();
  const filtered = state.items.filter(item => {
    return item.name.toLowerCase().includes(searchVal) || 
           item.unit.toLowerCase().includes(searchVal);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted)">No food items found matching search.</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.id = `item-row-${item.id}`;
    tr.innerHTML = `
      <td><strong>${item.name}</strong></td>
      <td>${item.baseQuantity}</td>
      <td>${item.unit}</td>
      <td style="color:var(--color-protein); font-weight:600">${item.protein}</td>
      <td style="color:var(--color-fat); font-weight:600">${item.fat}</td>
      <td style="color:var(--color-carbs); font-weight:600">${item.carbs}</td>
      <td style="color:var(--color-kcal); font-weight:700">${item.kcal}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit-btn" onclick="startEditItem('${item.id}')">
            <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.19L3,17.25Z"/></svg>
          </button>
          <button class="action-btn delete-btn" onclick="deleteFoodItem('${item.id}', '${item.name}')">
            <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function addFoodItem() {
  const name = document.getElementById('new-item-name').value.trim();
  const baseQuantity = Number(document.getElementById('new-item-qty').value);
  const unit = document.getElementById('new-item-unit').value;
  const protein = Number(document.getElementById('new-item-p').value);
  const fat = Number(document.getElementById('new-item-f').value);
  const carbs = Number(document.getElementById('new-item-c').value);

  if (!name || !baseQuantity || isNaN(protein) || isNaN(fat) || isNaN(carbs)) {
    showToast('Please fill all food library input fields correctly', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, baseQuantity, unit, protein, fat, carbs })
    });
    if (res.ok) {
      const newItem = await res.json();
      state.items.push(newItem);
      showToast(`${name} added to food library.`);
      
      // Clear inputs
      document.getElementById('new-item-name').value = '';
      document.getElementById('new-item-qty').value = '';
      document.getElementById('new-item-p').value = '';
      document.getElementById('new-item-f').value = '';
      document.getElementById('new-item-c').value = '';

      renderAll();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to add food item', 'error');
  }
}

// In-place edit for Food Library
function startEditItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  const tr = document.getElementById(`item-row-${id}`);
  tr.innerHTML = `
    <td><input type="text" class="inline-edit-input" id="edit-item-name-${id}" value="${item.name}"></td>
    <td><input type="number" class="inline-edit-input" id="edit-item-qty-${id}" value="${item.baseQuantity}" min="0.1"></td>
    <td>
      <select class="inline-edit-select" id="edit-item-unit-${id}">
        <option value="Grams" ${item.unit === 'Grams' ? 'selected' : ''}>Grams</option>
        <option value="Ounces" ${item.unit === 'Ounces' ? 'selected' : ''}>Ounces</option>
        <option value="tsp" ${item.unit === 'tsp' ? 'selected' : ''}>tsp</option>
        <option value="tbsp" ${item.unit === 'tbsp' ? 'selected' : ''}>tbsp</option>
        <option value="Item" ${item.unit === 'Item' ? 'selected' : ''}>Item</option>
        <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
      </select>
    </td>
    <td><input type="number" class="inline-edit-input" id="edit-item-p-${id}" value="${item.protein}" min="0" step="any"></td>
    <td><input type="number" class="inline-edit-input" id="edit-item-f-${id}" value="${item.fat}" min="0" step="any"></td>
    <td><input type="number" class="inline-edit-input" id="edit-item-c-${id}" value="${item.carbs}" min="0" step="any"></td>
    <td style="color:var(--text-muted); font-size:0.85rem">Auto Calc</td>
    <td>
      <div class="table-actions">
        <button class="action-btn edit-btn" style="color:#10b981; border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.1)" onclick="saveEditItem('${id}')">✓</button>
        <button class="action-btn delete-btn" onclick="renderFoodItemsTable()">×</button>
      </div>
    </td>
  `;
}

async function saveEditItem(id) {
  const name = document.getElementById(`edit-item-name-${id}`).value.trim();
  const baseQuantity = Number(document.getElementById(`edit-item-qty-${id}`).value);
  const unit = document.getElementById(`edit-item-unit-${id}`).value;
  const protein = Number(document.getElementById(`edit-item-p-${id}`).value);
  const fat = Number(document.getElementById(`edit-item-f-${id}`).value);
  const carbs = Number(document.getElementById(`edit-item-c-${id}`).value);

  if (!name || !baseQuantity) {
    showToast('Name and Base Quantity cannot be empty', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, baseQuantity, unit, protein, fat, carbs })
    });
    if (res.ok) {
      const updated = await res.json();
      
      // Update local state
      const idx = state.items.findIndex(i => i.id === id);
      state.items[idx] = updated;

      showToast(`Food item "${name}" updated successfully.`);
      
      // We re-fetch state to trigger cascading updates to ingredients, meals, and logs
      await fetchState();
    }
  } catch (err) {
    console.error(err);
    showToast('Error saving item edits', 'error');
  }
}

function deleteFoodItem(id, name) {
  openDeleteModal(name, async () => {
    try {
      const res = await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.items = state.items.filter(i => i.id !== id);
        showToast(`Food library item ${name} deleted.`);
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting item', 'error');
    }
  });
}

// ----------------------------------------------------
// 3. INGREDIENTS DASHBOARD
// ----------------------------------------------------

function renderIngredientsTable() {
  const tbody = document.getElementById('ingredients-list-body');
  tbody.innerHTML = '';

  const searchVal = document.getElementById('search-ingredients').value.toLowerCase();
  const filtered = state.ingredients.filter(ing => {
    const item = state.items.find(i => i.id === ing.itemId);
    const itemName = item ? item.name.toLowerCase() : '';
    return ing.name.toLowerCase().includes(searchVal) || itemName.includes(searchVal);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted)">No ingredients created yet. Add one below.</td></tr>`;
    return;
  }

  filtered.forEach(ing => {
    const item = state.items.find(i => i.id === ing.itemId);
    const itemName = item ? item.name : 'Unknown library item';
    const itemUnit = item ? item.unit : '';

    const tr = document.createElement('tr');
    tr.id = `ing-row-${ing.id}`;
    tr.innerHTML = `
      <td><strong>${ing.name}</strong></td>
      <td>${itemName}</td>
      <td>${ing.amount} ${itemUnit}</td>
      <td style="color:var(--color-protein); font-weight:600">${ing.protein}g</td>
      <td style="color:var(--color-fat); font-weight:600">${ing.fat}g</td>
      <td style="color:var(--color-carbs); font-weight:600">${ing.carbs}g</td>
      <td style="color:var(--color-kcal); font-weight:700">${ing.kcal} kcal</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit-btn" onclick="startEditIngredient('${ing.id}')">
            <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.19L3,17.25Z"/></svg>
          </button>
          <button class="action-btn delete-btn" onclick="deleteIngredient('${ing.id}', '${ing.name}')">
            <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateIngredientItemSelect() {
  // Overridden: using custom searchable dropdown. Just reset inputs.
  const hiddenInput = document.getElementById('new-ing-item');
  const searchInput = document.getElementById('new-ing-item-search');
  if (hiddenInput) hiddenInput.value = '';
  if (searchInput) searchInput.value = '';
  
  const hint = document.getElementById('new-ing-unit-hint');
  if (hint) hint.innerText = '';
}

function updateNewIngUnitHint() {
  const itemId = document.getElementById('new-ing-item').value;
  const item = state.items.find(i => i.id === itemId);
  const hint = document.getElementById('new-ing-unit-hint');
  if (hint) {
    hint.innerText = item ? item.unit : '';
  }
}

async function addIngredient() {
  const name = document.getElementById('new-ing-name').value.trim();
  const itemId = document.getElementById('new-ing-item').value;
  const amount = Number(document.getElementById('new-ing-amount').value);

  if (!itemId || !amount || isNaN(amount)) {
    showToast('Please specify an ingredient amount and related food item', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, itemId, amount })
    });
    if (res.ok) {
      const newIng = await res.json();
      state.ingredients.push(newIng);
      showToast(`Ingredient "${newIng.name}" added successfully.`);
      
      // Clear inputs
      document.getElementById('new-ing-name').value = '';
      document.getElementById('new-ing-amount').value = '';
      document.getElementById('new-ing-item').value = '';
      document.getElementById('new-ing-item-search').value = '';
      
      const hint = document.getElementById('new-ing-unit-hint');
      if (hint) hint.innerText = '';
      
      renderAll();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to add ingredient', 'error');
  }
}

function startEditIngredient(id) {
  const ing = state.ingredients.find(i => i.id === id);
  if (!ing) return;

  const tr = document.getElementById(`ing-row-${id}`);

  // Create Select Options for related items
  let itemOptions = '';
  state.items.forEach(item => {
    itemOptions += `<option value="${item.id}" ${item.id === ing.itemId ? 'selected' : ''}>${item.name}</option>`;
  });

  tr.innerHTML = `
    <td><input type="text" class="inline-edit-input" id="edit-ing-name-${id}" value="${ing.name}"></td>
    <td>
      <select class="inline-edit-select" id="edit-ing-item-${id}">
        ${itemOptions}
      </select>
    </td>
    <td><input type="number" class="inline-edit-input" id="edit-ing-amount-${id}" value="${ing.amount}" min="0.1"></td>
    <td style="color:var(--text-muted); font-size:0.85rem">Auto Calc</td>
    <td style="color:var(--text-muted); font-size:0.85rem">Auto Calc</td>
    <td style="color:var(--text-muted); font-size:0.85rem">Auto Calc</td>
    <td style="color:var(--text-muted); font-size:0.85rem">Auto Calc</td>
    <td>
      <div class="table-actions">
        <button class="action-btn edit-btn" style="color:#10b981; border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.1)" onclick="saveEditIngredient('${id}')">✓</button>
        <button class="action-btn delete-btn" onclick="renderIngredientsTable()">×</button>
      </div>
    </td>
  `;
}

async function saveEditIngredient(id) {
  const name = document.getElementById(`edit-ing-name-${id}`).value.trim();
  const itemId = document.getElementById(`edit-ing-item-${id}`).value;
  const amount = Number(document.getElementById(`edit-ing-amount-${id}`).value);

  if (!itemId || !amount) {
    showToast('Amount and Item relation are required', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/ingredients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, itemId, amount })
    });
    if (res.ok) {
      const updated = await res.json();
      
      // Update local state
      const idx = state.ingredients.findIndex(i => i.id === id);
      state.ingredients[idx] = updated;

      showToast(`Ingredient "${name}" updated.`);
      
      // Refresh database state to trigger updates cascade to meals and logs
      await fetchState();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to save ingredient edits', 'error');
  }
}

function deleteIngredient(id, name) {
  openDeleteModal(name, async () => {
    try {
      const res = await fetch(`${API_BASE}/ingredients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.ingredients = state.ingredients.filter(i => i.id !== id);
        showToast(`Ingredient "${name}" deleted.`);
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting ingredient', 'error');
    }
  });
}

// ----------------------------------------------------
// 4. MEALS DASHBOARD (COMPOSITION)
// ----------------------------------------------------

function renderMealsGrid() {
  const container = document.getElementById('meals-cards-container');
  container.innerHTML = '';

  const searchVal = document.getElementById('search-meals').value.toLowerCase();
  
  // Filter meals
  const filtered = state.meals.filter(meal => {
    // Search by meal name, or constituent ingredients
    const ingNames = meal.ingredientIds.map(id => {
      const ing = state.ingredients.find(i => i.id === id);
      return ing ? ing.name.toLowerCase() : '';
    }).join(' ');

    return meal.name.toLowerCase().includes(searchVal) || ingNames.includes(searchVal);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color:var(--text-muted)">No meals composed yet. Click 'Create New Meal' to begin.</div>`;
    return;
  }

  filtered.forEach(meal => {
    const card = document.createElement('div');
    card.className = 'glass-card meal-card';
    
    // Resolve ingredient names
    const ingList = meal.ingredientIds.map(ingId => {
      const ing = state.ingredients.find(i => i.id === ingId);
      return ing ? ing.name : 'Unknown';
    }).join(', ');

    card.innerHTML = `
      <div class="meal-card-header">
        <h3 class="meal-card-title">${meal.name}</h3>
        <div class="table-actions">
          <button class="action-btn edit-btn" onclick="openEditMealModal('${meal.id}')" title="Edit Meal Recipe">
            <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.19L3,17.25Z"/></svg>
          </button>
          <button class="action-btn delete-btn" onclick="deleteMeal('${meal.id}', '${meal.name}')" title="Delete Meal">
            <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>
      </div>
      <p class="meal-card-ingredients" title="${ingList}">
        <strong>Ingredients:</strong> ${ingList || 'None selected'}
      </p>
      <div class="meal-card-macros">
        <div class="meal-macro-box p">
          <span class="meal-macro-lbl">Prot</span>
          <span class="meal-macro-val">${meal.protein}g</span>
        </div>
        <div class="meal-macro-box f">
          <span class="meal-macro-lbl">Fat</span>
          <span class="meal-macro-val">${meal.fat}g</span>
        </div>
        <div class="meal-macro-box c">
          <span class="meal-macro-lbl">Carbs</span>
          <span class="meal-macro-val">${meal.carbs}g</span>
        </div>
        <div class="meal-macro-box k">
          <span class="meal-macro-lbl">Kcal</span>
          <span class="meal-macro-val">${Math.round(meal.kcal)}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderIngredientsCheckboxes(selectedIds = []) {
  const container = document.getElementById('meal-ingredients-checkboxes');
  container.innerHTML = '';

  if (state.ingredients.length === 0) {
    container.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-muted); font-size:0.85rem">No ingredients saved. Add some in the Ingredients tab first.</div>`;
    return;
  }

  state.ingredients.forEach(ing => {
    const isChecked = selectedIds.includes(ing.id) ? 'checked' : '';
    const label = document.createElement('label');
    label.className = 'meal-ing-checkbox-row';
    label.innerHTML = `
      <input type="checkbox" name="meal-ing-check" value="${ing.id}" ${isChecked}>
      <div style="flex:1">
        <div style="font-weight:600; font-size:0.9rem">${ing.name}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary)">P: ${ing.protein}g | F: ${ing.fat}g | C: ${ing.carbs}g | Kcal: ${ing.kcal}</div>
      </div>
    `;

    // Listen to changes to update selected summary
    const checkbox = label.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', updateMealSelectedSummary);

    container.appendChild(label);
  });

  updateMealSelectedSummary();
}

function updateMealSelectedSummary() {
  const checkboxes = document.querySelectorAll('input[name="meal-ing-check"]:checked');
  const summaryEl = document.getElementById('meal-selected-summary');
  if (!summaryEl) return;

  if (checkboxes.length === 0) {
    summaryEl.innerHTML = `<strong>Added Ingredients:</strong> None`;
    return;
  }

  const names = Array.from(checkboxes).map(cb => {
    const ing = state.ingredients.find(i => i.id === cb.value);
    return ing ? ing.name : 'Unknown';
  });

  summaryEl.innerHTML = `<strong>Added Ingredients:</strong> ${names.join(', ')}`;
}

function openCreateMealModal() {
  currentEditingMealId = null;
  document.getElementById('meal-modal-title').innerText = 'Compose New Meal';
  document.getElementById('meal-form').reset();
  document.getElementById('meal-edit-id').value = '';
  document.getElementById('meal-modal-submit-btn').innerText = 'Save Meal';
  document.getElementById('meal-ing-search').value = '';
  
  renderIngredientsCheckboxes();
  document.getElementById('meal-modal').classList.add('active');
}

function openEditMealModal(id) {
  const meal = state.meals.find(m => m.id === id);
  if (!meal) return;

  currentEditingMealId = id;
  document.getElementById('meal-modal-title').innerText = 'Edit Meal Recipe';
  document.getElementById('meal-edit-id').value = meal.id;
  document.getElementById('meal-name-input').value = meal.name;
  document.getElementById('meal-modal-submit-btn').innerText = 'Save Edits';
  document.getElementById('meal-ing-search').value = '';

  renderIngredientsCheckboxes(meal.ingredientIds);
  document.getElementById('meal-modal').classList.add('active');
}

function closeMealModal() {
  document.getElementById('meal-modal').classList.remove('active');
}

async function handleMealFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('meal-name-input').value.trim();
  const id = document.getElementById('meal-edit-id').value;

  // Retrieve checked ingredients
  const checkboxes = document.querySelectorAll('input[name="meal-ing-check"]:checked');
  const ingredientIds = Array.from(checkboxes).map(cb => cb.value);

  if (!name) {
    showToast('Meal name is required', 'error');
    return;
  }
  if (ingredientIds.length === 0) {
    showToast('Please select at least one ingredient to compose the meal', 'error');
    return;
  }

  const payload = { name, ingredientIds };

  try {
    let res;
    if (id) {
      // Edit mode
      res = await fetch(`${API_BASE}/meals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // Create mode
      res = await fetch(`${API_BASE}/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (res.ok) {
      const meal = await res.json();
      if (id) {
        const idx = state.meals.findIndex(m => m.id === id);
        state.meals[idx] = meal;
        showToast(`Meal recipe "${name}" updated successfully.`);
      } else {
        state.meals.push(meal);
        showToast(`Meal recipe "${name}" created.`);
      }
      closeMealModal();
      
      // Fetch state to trigger calculations cascades
      await fetchState();
    }
  } catch (err) {
    console.error(err);
    showToast('Error saving meal recipe', 'error');
  }
}

function deleteMeal(id, name) {
  openDeleteModal(name, async () => {
    try {
      const res = await fetch(`${API_BASE}/meals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.meals = state.meals.filter(m => m.id !== id);
        showToast(`Meal recipe "${name}" deleted.`);
        renderAll();
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting meal', 'error');
    }
  });
}

// ----------------------------------------------------
// 5. HISTORY DAILY CARDS VIEW
// ----------------------------------------------------

function renderHistoryCards() {
  const container = document.getElementById('history-grid-container');
  container.innerHTML = '';

  const searchVal = document.getElementById('search-history').value.toLowerCase();

  // Group logs by date
  const logsByDate = state.logs.reduce((acc, log) => {
    if (!acc[log.date]) {
      acc[log.date] = [];
    }
    acc[log.date].push(log);
    return acc;
  }, {});

  // Extract date summaries
  const datesSummarized = Object.keys(logsByDate).map(date => {
    const dayLogs = logsByDate[date];
    const macros = dayLogs.reduce((sum, l) => {
      sum.p += l.protein || 0;
      sum.f += l.fat || 0;
      sum.c += l.carbs || 0;
      sum.kcal += l.kcal || 0;
      return sum;
    }, { p: 0, f: 0, c: 0, kcal: 0 });

    return {
      date,
      protein: Number(macros.p.toFixed(1)),
      fat: Number(macros.f.toFixed(1)),
      carbs: Number(macros.c.toFixed(1)),
      kcal: Number(macros.kcal.toFixed(1))
    };
  });

  // Sort history: newer dates first
  // Simple date parser for DD-MMM-YY (e.g. 30-Jun-26)
  const parseDateStr = (str) => {
    const parts = str.split('-');
    if (parts.length !== 3) return new Date(0);
    const day = parseInt(parts[0]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months.indexOf(parts[1]);
    const year = 2000 + parseInt(parts[2]);
    return new Date(year, month, day);
  };

  datesSummarized.sort((a, b) => parseDateStr(b.date) - parseDateStr(a.date));

  // Filter summarized history dates
  const filtered = datesSummarized.filter(day => {
    const isToday = day.date === state.activeDate ? 'today current' : '';
    const queryMatches = day.date.toLowerCase().includes(searchVal) || 
                         String(day.kcal).includes(searchVal) ||
                         isToday.includes(searchVal);
    return queryMatches;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color:var(--text-muted)">No historical logs match your search.</div>`;
    return;
  }

  filtered.forEach(day => {
    const card = document.createElement('div');
    card.className = 'glass-card history-card';
    if (day.date === state.activeDate) {
      card.style.borderColor = 'rgba(233, 64, 87, 0.4)';
      card.style.background = 'rgba(233, 64, 87, 0.05)';
    }

    const goals = state.goals; // Let's evaluate relative to current goals
    
    const pct = {
      p: Math.min(100, (day.protein / goals.protein) * 100),
      f: Math.min(100, (day.fat / goals.fat) * 100),
      c: Math.min(100, (day.carbs / goals.carbs) * 100),
      k: Math.min(100, (day.kcal / goals.kcal) * 100),
    };

    const activeTextBadge = day.date === state.activeDate 
      ? '<span style="font-size:0.7rem; color:#e94057; font-weight:700; background:rgba(233, 64, 87, 0.15); padding:0.15rem 0.4rem; border-radius:4px">ACTIVE DAY</span>' 
      : '';

    card.innerHTML = `
      <div class="history-card-header">
        <div style="display:flex; flex-direction:column; gap:0.1rem">
          <span class="history-date">${day.date}</span>
          ${activeTextBadge}
        </div>
        <span class="history-kcal-total">${Math.round(day.kcal)} <span style="font-size:0.85rem; font-weight:500; color:var(--text-secondary)">kcal</span></span>
      </div>
      <div class="history-stats-list">
        <div class="history-stat-row p">
          <span>Protein: <strong>${day.protein}g</strong></span>
          <span style="color:var(--text-muted)">Goal: ${goals.protein}g</span>
        </div>
        <div class="history-stat-bar-mini">
          <div class="history-bar-fill" style="width: ${pct.p}%; background: var(--color-protein)"></div>
        </div>

        <div class="history-stat-row f">
          <span>Fat: <strong>${day.fat}g</strong></span>
          <span style="color:var(--text-muted)">Goal: ${goals.fat}g</span>
        </div>
        <div class="history-stat-bar-mini">
          <div class="history-bar-fill" style="width: ${pct.f}%; background: var(--color-fat)"></div>
        </div>

        <div class="history-stat-row c">
          <span>Carbs: <strong>${day.carbs}g</strong></span>
          <span style="color:var(--text-muted)">Goal: ${goals.carbs}g</span>
        </div>
        <div class="history-stat-bar-mini">
          <div class="history-bar-fill" style="width: ${pct.c}%; background: var(--color-carbs)"></div>
        </div>

        <div class="history-stat-row k">
          <span>Calories: <strong>${Math.round(day.kcal)} kcal</strong></span>
          <span style="color:var(--text-muted)">Goal: ${Math.round(goals.kcal)}</span>
        </div>
        <div class="history-stat-bar-mini">
          <div class="history-bar-fill" style="width: ${pct.k}%; background: var(--color-kcal)"></div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ----------------------------------------------------
// DELETE CONFIRMATION MODAL HELPER
// ----------------------------------------------------

function openDeleteModal(name, onConfirmCallback) {
  document.getElementById('delete-target-name').innerText = name;
  deleteCallback = onConfirmCallback;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
  deleteCallback = null;
}

// ----------------------------------------------------
// CUSTOM SEARCHABLE DROPDOWNS CONTROLLER
// ----------------------------------------------------

function setupCustomDropdowns() {
  setupSearchableDropdown(
    'item',
    'item-dropdown-wrapper',
    'log-item-search',
    'log-item-select',
    'item-options-list',
    () => state.items
  );

  setupSearchableDropdown(
    'meal',
    'meal-dropdown-wrapper',
    'log-meal-search',
    'log-meal-select',
    'meal-options-list',
    () => state.meals
  );

  // Ingredient Food Library item searchable dropdown
  setupSearchableDropdown(
    'item',
    'new-ing-item-wrapper',
    'new-ing-item-search',
    'new-ing-item',
    'new-ing-item-options-list',
    () => state.items,
    updateNewIngUnitHint
  );
}

function setupSearchableDropdown(type, wrapperId, inputId, hiddenId, listId, getOptionsFn, onSelectCallback = null) {
  const searchInput = document.getElementById(inputId);
  const hiddenInput = document.getElementById(hiddenId);
  const listContainer = document.getElementById(listId);
  const wrapper = document.getElementById(wrapperId);

  function renderOptions() {
    const query = searchInput.value.toLowerCase().trim();
    const options = getOptionsFn();
    
    // Substring name match
    const filtered = options.filter(opt => {
      return opt.name.toLowerCase().includes(query);
    });

    listContainer.innerHTML = '';
    
    if (filtered.length === 0) {
      listContainer.innerHTML = `<div style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.85rem">No matches found</div>`;
      return;
    }

    filtered.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'dropdown-option-item';
      
      let subtitle = '';
      if (type === 'item') {
        subtitle = `Base: ${opt.baseQuantity} ${opt.unit} | P: ${opt.protein}g F: ${opt.fat}g C: ${opt.carbs}g | Kcal: ${Math.round(opt.kcal)}`;
      } else {
        subtitle = `P: ${opt.protein}g F: ${opt.fat}g C: ${opt.carbs}g | Kcal: ${Math.round(opt.kcal)}`;
      }

      div.innerHTML = `
        <span class="dropdown-option-title">${opt.name}</span>
        <span class="dropdown-option-subtitle">${subtitle}</span>
      `;

      // Select option on click
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = opt.name;
        hiddenInput.value = opt.id;
        listContainer.classList.remove('active');
        updateLogFormHints();
        if (onSelectCallback) onSelectCallback();
      });

      listContainer.appendChild(div);
    });
  }

  // Focus displays list
  searchInput.addEventListener('focus', () => {
    closeAllDropdownsExcept(listId);
    renderOptions();
    listContainer.classList.add('active');
  });

  // Typing filters list
  searchInput.addEventListener('input', () => {
    // If value matches exactly, validate value. Otherwise invalidate hidden input
    const match = getOptionsFn().find(o => o.name.toLowerCase() === searchInput.value.toLowerCase().trim());
    if (match) {
      hiddenInput.value = match.id;
    } else {
      hiddenInput.value = '';
    }
    updateLogFormHints();
    renderOptions();
  });

  // Clicking outside closes list
  window.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      listContainer.classList.remove('active');
    }
  });
}

function closeAllDropdownsExcept(exceptId) {
  ['item-options-list', 'meal-options-list', 'new-ing-item-options-list'].forEach(id => {
    if (id !== exceptId) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    }
  });
}

// ----------------------------------------------------
// WEIGHT TRACKER VIEW & ACTIONS
// ----------------------------------------------------

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const year = parts[0];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[monthIndex]} ${year}`;
}

function formatMonthChartLabel(monthStr) {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const year = parts[0].slice(-2);
  const monthIndex = parseInt(parts[1], 10) - 1;
  const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${shortMonthNames[monthIndex]} '${year}`;
}

function renderWeightTracker() {
  const listContainer = document.getElementById('weight-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  state.weights.sort((a, b) => a.month.localeCompare(b.month));

  // Render Trend Summary & Badge
  const summaryEl = document.getElementById('weight-trend-summary');
  const badgeEl = document.getElementById('weight-trend-badge');
  if (state.weights.length === 0) {
    if (summaryEl) summaryEl.innerText = '';
    if (badgeEl) badgeEl.style.display = 'none';
  } else if (state.weights.length === 1) {
    if (badgeEl) {
      badgeEl.style.display = 'inline-block';
      badgeEl.innerText = 'Initial Log';
      badgeEl.style.background = 'rgba(255, 255, 255, 0.05)';
      badgeEl.style.color = 'var(--text-secondary)';
      badgeEl.style.border = '1px solid var(--border-glass)';
    }
    if (summaryEl) {
      summaryEl.innerText = `Starting weight logged at ${state.weights[0].weight.toFixed(2)} kg for ${formatMonthLabel(state.weights[0].month)}. Add more monthly logs to see your trend.`;
    }
  } else {
    const firstLog = state.weights[0];
    const lastLog = state.weights[state.weights.length - 1];
    const totalDiff = lastLog.weight - firstLog.weight;
    
    const firstParts = firstLog.month.split('-');
    const lastParts = lastLog.month.split('-');
    const monthSpan = (parseInt(lastParts[0], 10) - parseInt(firstParts[0], 10)) * 12 + (parseInt(lastParts[1], 10) - parseInt(firstParts[1], 10));

    let summaryText = '';
    if (totalDiff < 0) {
      const absDiff = Math.abs(totalDiff);
      summaryText = `Since your initial log in ${formatMonthLabel(firstLog.month)} (${firstLog.weight.toFixed(2)} kg), you have lost a total of `;
      summaryText += `<strong>${absDiff.toFixed(2)} kg</strong> over the course of ${monthSpan} month(s). `;
      summaryText += `Your weight decreased to <strong>${lastLog.weight.toFixed(2)} kg</strong>, averaging a loss of `;
      summaryText += `<strong>${(absDiff / Math.max(1, monthSpan)).toFixed(2)} kg</strong> per month. Fantastic effort!`;
      
      if (badgeEl) {
        badgeEl.style.display = 'inline-block';
        badgeEl.innerText = 'Losing Weight';
        badgeEl.style.background = 'rgba(16, 185, 129, 0.1)';
        badgeEl.style.color = '#10b981';
        badgeEl.style.border = '1px solid rgba(16, 185, 129, 0.2)';
      }
    } else if (totalDiff > 0) {
      summaryText = `Since your initial log in ${formatMonthLabel(firstLog.month)} (${firstLog.weight.toFixed(2)} kg), your weight has increased by `;
      summaryText += `<strong>${totalDiff.toFixed(2)} kg</strong> over ${monthSpan} month(s), reaching `;
      summaryText += `<strong>${lastLog.weight.toFixed(2)} kg</strong>. This is an average increase of `;
      summaryText += `<strong>${(totalDiff / Math.max(1, monthSpan)).toFixed(2)} kg</strong> per month. Keep monitoring your goals!`;
      
      if (badgeEl) {
        badgeEl.style.display = 'inline-block';
        badgeEl.innerText = 'Weight Gain';
        badgeEl.style.background = 'rgba(239, 68, 68, 0.1)';
        badgeEl.style.color = '#ef4444';
        badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
      }
    } else {
      summaryText = `Your weight is stable at <strong>${lastLog.weight.toFixed(2)} kg</strong>. Over the last ${monthSpan} month(s) since `;
      summaryText += `${formatMonthLabel(firstLog.month)}, you maintained a net change of <strong>0.00 kg</strong>.`;
      
      if (badgeEl) {
        badgeEl.style.display = 'inline-block';
        badgeEl.innerText = 'Stable';
        badgeEl.style.background = 'rgba(107, 114, 128, 0.15)';
        badgeEl.style.color = 'var(--text-secondary)';
        badgeEl.style.border = '1px solid var(--border-glass)';
      }
    }
    
    if (summaryEl) {
      summaryEl.innerHTML = summaryText;
    }
  }

  state.weights.forEach((w, idx) => {
    const formattedMonth = formatMonthLabel(w.month);
    
    let changeText = '—';
    let changeClass = '';
    if (idx > 0) {
      const diff = w.weight - state.weights[idx - 1].weight;
      if (diff < 0) {
        changeText = `${diff.toFixed(2)} kg`;
        changeClass = 'change-loss';
      } else if (diff > 0) {
        changeText = `+${diff.toFixed(2)} kg`;
        changeClass = 'change-gain';
      } else {
        changeText = '0.00 kg';
        changeClass = 'change-none';
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formattedMonth}</td>
      <td style="font-weight:600">${w.weight.toFixed(2)} kg</td>
      <td><span class="${changeClass}">${changeText}</span></td>
      <td style="text-align: right">
        <button class="action-btn delete-btn" onclick="deleteWeight('${w.id}')" title="Delete Log">
          <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
        </button>
      </td>
    `;
    listContainer.appendChild(tr);
  });

  renderWeightChart();
}

function renderWeightChart() {
  const container = document.getElementById('weight-chart-container');
  if (!container) return;
  container.innerHTML = '';

  if (state.weights.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); padding: 2rem 0;">
        <svg style="width:48px; height:48px; stroke:currentColor; stroke-width:1.5; fill:none; margin-bottom:1rem; opacity:0.5;" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.281m5.94 2.28m0 0a12.115 12.115 0 01-6.185 14.308" />
        </svg>
        <p style="font-weight:500">No weight logs recorded yet</p>
        <p style="font-size:0.85rem; margin-top:0.25rem; opacity:0.7">Log your weight on the right to visualize your trend line.</p>
      </div>
    `;
    return;
  }

  const width = 600;
  const height = 280;
  const top = 35;
  const bottom = 45;
  const left = 55;
  const right = 35;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const weights = state.weights.map(w => w.weight);
  let minW = Math.min(...weights);
  let maxW = Math.max(...weights);
  
  let range = maxW - minW;
  if (range === 0) {
    minW = Math.max(0, minW - 5);
    maxW = maxW + 5;
  } else {
    minW = Math.max(0, minW - range * 0.15 - 1);
    maxW = maxW + range * 0.15 + 1;
  }
  
  let gridLinesHtml = '';
  for (let j = 0; j < 4; j++) {
    const val = minW + (j / 3) * (maxW - minW);
    const y = top + plotHeight - (j / 3) * plotHeight;
    gridLinesHtml += `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="var(--border-glass)" stroke-width="1" stroke-dasharray="4,4" />
      <text x="${left - 10}" y="${y + 4}" fill="var(--text-secondary)" font-size="11" text-anchor="end" font-weight="500">${val.toFixed(2)}</text>
    `;
  }

  const points = state.weights.map((w, idx) => {
    let x = left + plotWidth / 2;
    if (state.weights.length > 1) {
      x = left + (idx / (state.weights.length - 1)) * plotWidth;
    }
    const y = top + plotHeight - ((w.weight - minW) / (maxW - minW)) * plotHeight;
    return { x, y, weight: w.weight, month: w.month };
  });

  let linePath = '';
  let areaPath = '';
  if (points.length > 1) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = linePath + ` L ${points[points.length - 1].x} ${top + plotHeight} L ${points[0].x} ${top + plotHeight} Z`;
  }

  let pointsHtml = '';
  let labelsHtml = '';
  points.forEach(p => {
    labelsHtml += `
      <g class="chart-point-label" opacity="0.9">
        <rect x="${p.x - 25}" y="${p.y - 28}" width="50" height="18" rx="4" fill="rgba(15, 14, 23, 0.85)" stroke="var(--border-glass)" stroke-width="1" />
        <text x="${p.x}" y="${p.y - 15}" fill="#fff" font-size="10" text-anchor="middle" font-weight="600">${p.weight.toFixed(2)}</text>
      </g>
    `;
    pointsHtml += `
      <circle cx="${p.x}" cy="${p.y}" r="6" fill="#fff" stroke="#e94057" stroke-width="3" filter="drop-shadow(0px 0px 5px rgba(233, 64, 87, 0.6))" />
    `;
    const formattedMonth = formatMonthChartLabel(p.month);
    labelsHtml += `
      <text x="${p.x}" y="${height - 15}" fill="var(--text-secondary)" font-size="11" text-anchor="middle" font-weight="500">${formattedMonth}</text>
    `;
  });

  let svgContent = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; font-family: var(--font-sans);">
      <defs>
        <linearGradient id="weight-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#8a2387" />
          <stop offset="50%" stop-color="#e94057" />
          <stop offset="100%" stop-color="#f27121" />
        </linearGradient>
        <linearGradient id="weight-area-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#e94057" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#e94057" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      
      ${gridLinesHtml}
      ${areaPath ? `<path d="${areaPath}" fill="url(#weight-area-grad)" />` : ''}
      ${linePath ? `<path d="${linePath}" fill="none" stroke="url(#weight-line-grad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />` : ''}
      ${labelsHtml}
      ${pointsHtml}
    </svg>
  `;
  container.innerHTML = svgContent;
}

window.deleteWeight = (id) => {
  const weightEntry = state.weights.find(w => w.id === id);
  if (!weightEntry) return;

  const formattedMonth = formatMonthLabel(weightEntry.month);
  
  openDeleteModal(`weight log for ${formattedMonth} (${weightEntry.weight.toFixed(2)} kg)`, async () => {
    try {
      const res = await fetch(`${API_BASE}/weights/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        state.weights = state.weights.filter(w => w.id !== id);
        showToast('Weight log deleted successfully');
        renderAll();
      } else {
        showToast('Failed to delete weight log', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting weight log', 'error');
    }
  });
};
