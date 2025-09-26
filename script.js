/*
 * Improved Grocery Planner client‑side logic.
 *
 * This script manages recipes, pantry items, weekly meal plans and
 * generating grocery lists by aggregating recipe ingredients and
 * subtracting pantry quantities.  Data is persisted in
 * localStorage under the keys `gp_recipes`, `gp_pantry` and
 * `gp_weeks`.  The UI is kept simple and focuses on manual data
 * entry rather than external API integrations.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Predefined units and store sections
  const units = [
    { id: 'g', name: 'grams', short: 'g' },
    { id: 'kg', name: 'kilograms', short: 'kg' },
    { id: 'ml', name: 'millilitres', short: 'ml' },
    { id: 'l', name: 'litres', short: 'L' },
    { id: 'tsp', name: 'teaspoons', short: 'tsp' },
    { id: 'tbsp', name: 'tablespoons', short: 'tbsp' },
    { id: 'cup', name: 'cups', short: 'cup' },
    { id: 'pc', name: 'pieces', short: 'pc' },
    { id: 'can', name: 'cans', short: 'can' },
    { id: 'pack', name: 'packs', short: 'pack' },
  ];

  const sections = [
    { id: 'produce', name: 'Produce', sort: 1 },
    { id: 'dairy', name: 'Dairy & Eggs', sort: 2 },
    { id: 'frozen', name: 'Frozen', sort: 3 },
    { id: 'dry', name: 'Dry Goods', sort: 4 },
    { id: 'canned', name: 'Canned & Jars', sort: 5 },
    { id: 'baking', name: 'Baking & Spices', sort: 6 },
    { id: 'bakery', name: 'Bakery', sort: 7 },
    { id: 'beverages', name: 'Beverages', sort: 8 },
    { id: 'snacks', name: 'Snacks', sort: 9 },
    { id: 'household', name: 'Household', sort: 10 },
    { id: 'personal', name: 'Personal Care', sort: 11 },
    { id: 'misc', name: 'Misc', sort: 12 },
  ];

  // In‑memory copies of data persisted in localStorage
  let recipes = [];
  let pantry = [];
  let weeks = {};
  // Persisted grocery list from the last generation.  This array
  // stores objects { id, name, qty, unitId, sectionId, covered, checked } and
  // the weekStart they were generated for.  Used to carry leftovers and
  // restore checkbox state.
  let lastList = { weekStart: null, items: [] };
  // Carried over items when starting a new week.  This is populated
  // when the user opts to carry forward leftover items from the
  // previous week.
  let carriedItems = [];
  // Track recipe currently being edited; null when creating new
  let editingRecipeId = null;

  /**
   * Load persisted data from localStorage into in‑memory structures.
   */
  function loadData() {
    try {
      const r = localStorage.getItem('gp_recipes');
      recipes = r ? JSON.parse(r) : [];
    } catch (err) {
      recipes = [];
    }
    try {
      const p = localStorage.getItem('gp_pantry');
      pantry = p ? JSON.parse(p) : [];
    } catch (err) {
      pantry = [];
    }
    try {
      const w = localStorage.getItem('gp_weeks');
      weeks = w ? JSON.parse(w) : {};
    } catch (err) {
      weeks = {};
    }
    try {
      const ll = localStorage.getItem('gp_lastList');
      lastList = ll ? JSON.parse(ll) : { weekStart: null, items: [] };
    } catch (err) {
      lastList = { weekStart: null, items: [] };
    }
  }

  /**
   * Persist in‑memory data back to localStorage.
   */
  function saveData() {
    localStorage.setItem('gp_recipes', JSON.stringify(recipes));
    localStorage.setItem('gp_pantry', JSON.stringify(pantry));
    localStorage.setItem('gp_weeks', JSON.stringify(weeks));
    // Also persist last generated list separately if present
    if (lastList && lastList.items) {
      localStorage.setItem('gp_lastList', JSON.stringify(lastList));
    }
  }

  /**
   * Populate a select element with unit options.
   * @param {HTMLSelectElement} select
   */
  function populateUnitSelect(select) {
    // Clear current options
    select.innerHTML = '';
    units.forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name;
      select.appendChild(opt);
    });
  }

  /**
   * Populate a select element with section options.
   * @param {HTMLSelectElement} select
   */
  function populateSectionSelect(select) {
    select.innerHTML = '';
    sections.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });
  }

  /**
   * Generate a unique identifier.  We use a timestamp and a random
   * suffix so that recipe and pantry ids are stable across sessions.
   */
  function generateId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
    );
  }

  /**
   * Utility to compute the Monday of the week for a given date string.
   * @param {string} dateStr - ISO string from an input[type=date]
   */
  function getWeekStart(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay(); // Sunday=0
    const diff = (day === 0 ? -6 : 1) - day; // days to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().substr(0, 10);
  }

  /**
   * Show a transient toast notification at the bottom of the page.
   * @param {string} message The message to display.
   * @param {number} duration Duration in ms before removal (default 3000).
   */
  function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
      div.remove();
    }, duration);
  }

  /**
   * Convert between compatible units (grams/kilograms, millilitres/litres).
   * Returns the converted value or null if conversion is not supported.
   * @param {number} value
   * @param {string} fromUnit
   * @param {string} toUnit
   */
  function convertUnit(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;
    const conversions = {
      g: { kg: (v) => v / 1000 },
      kg: { g: (v) => v * 1000 },
      ml: { l: (v) => v / 1000 },
      l: { ml: (v) => v * 1000 },
    };
    if (conversions[fromUnit] && conversions[fromUnit][toUnit]) {
      return conversions[fromUnit][toUnit](value);
    }
    return null;
  }

  /**
   * Ensure a week object exists in `weeks` for the given start date.
   * If not present, create a new week skeleton with seven days and
   * empty meals.
   * @param {string} weekStart ISO date string (Monday)
   */
  function ensureWeek(weekStart) {
    if (!weeks[weekStart]) {
      const weekObj = { days: {} };
      const start = new Date(weekStart);
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const iso = date.toISOString().substr(0, 10);
        weekObj.days[iso] = {
          meals: {
            breakfast: { recipeId: null },
            lunch: { recipeId: null },
            dinner: { recipeId: null },
            snack: { recipeId: null },
            drinks: { recipeId: null },
          },
        };
      }
      weeks[weekStart] = weekObj;
    }
  }

  /**
   * Render the weekly plan table for the selected week.
   * @param {string} weekStart
   */
  function renderPlan(weekStart) {
    ensureWeek(weekStart);
    const planContainer = document.getElementById('plan-container');
    planContainer.innerHTML = '';
    const table = document.createElement('table');
    table.classList.add('meal-table');

    // Header row
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.appendChild(document.createElement('th')); // Empty corner cell
    ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drinks'].forEach((m) => {
      const th = document.createElement('th');
      th.textContent = m;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const days = weeks[weekStart].days;
    const dayKeys = Object.keys(days).sort();
    dayKeys.forEach((date) => {
      const row = document.createElement('tr');
      const dayCell = document.createElement('td');
      // Format date as e.g. Mon 25/09
      const d = new Date(date + 'T00:00:00');
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const label = `${dayNames[d.getDay()]} ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      dayCell.textContent = label;
      row.appendChild(dayCell);
      // For each meal
      ['breakfast', 'lunch', 'dinner', 'snack', 'drinks'].forEach(
        (mealKey) => {
          const cell = document.createElement('td');
          const select = document.createElement('select');
          // Add default option
          const noneOpt = document.createElement('option');
          noneOpt.value = '';
          noneOpt.textContent = '-- Select --';
          select.appendChild(noneOpt);
          // Populate recipe options
          recipes.forEach((recipe) => {
            const opt = document.createElement('option');
            opt.value = recipe.id;
            opt.textContent = recipe.title;
            select.appendChild(opt);
          });
          // Set current value
          select.value = days[date].meals[mealKey].recipeId || '';
          // Listener to update data
          select.addEventListener('change', () => {
            days[date].meals[mealKey].recipeId = select.value || null;
            saveData();
          });
          cell.appendChild(select);
          row.appendChild(cell);
        },
      );
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    planContainer.appendChild(table);
  }

  /**
   * Render the list of saved recipes in the Recipes section.
   */
  function renderRecipeList() {
    const listEl = document.getElementById('recipe-list');
    listEl.innerHTML = '';
    recipes.forEach((recipe) => {
      const li = document.createElement('li');
      // Title span
      const span = document.createElement('span');
      span.textContent = recipe.title;
      span.style.cursor = 'pointer';
      span.title = 'Click to edit';
      span.addEventListener('click', () => {
        // Load recipe into form for editing
        editingRecipeId = recipe.id;
        // Populate form fields
        document.getElementById('recipe-title').value = recipe.title;
        document.getElementById('recipe-instructions').value = recipe.instructions;
        const container = document.getElementById('ingredients-container');
        container.innerHTML = '';
        recipe.ingredients.forEach((ing) => {
          // Add a row prefilled
          const row = document.createElement('div');
          row.classList.add('ingredient-row');
          const nameInput = document.createElement('input');
          nameInput.type = 'text';
          nameInput.value = ing.name;
          nameInput.required = true;
          row.appendChild(nameInput);
          const qtyInput = document.createElement('input');
          qtyInput.type = 'number';
          qtyInput.min = '0';
          qtyInput.step = 'any';
          qtyInput.value = ing.qty;
          qtyInput.required = true;
          row.appendChild(qtyInput);
          const unitSelect = document.createElement('select');
          populateUnitSelect(unitSelect);
          unitSelect.value = ing.unitId;
          row.appendChild(unitSelect);
          const sectionSelect = document.createElement('select');
          populateSectionSelect(sectionSelect);
          sectionSelect.value = ing.sectionId;
          row.appendChild(sectionSelect);
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.classList.add('close-btn');
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', () => {
            container.removeChild(row);
          });
          row.appendChild(removeBtn);
          container.appendChild(row);
        });
        // Show cancel editing button and change save button text
        document.getElementById('cancel-edit').classList.remove('section-hidden');
        document.querySelector('#recipe-form button.primary').textContent = 'Save Changes';
        // Switch to Recipes section
        document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
        document.querySelector('nav button[data-section="recipes"]').classList.add('active');
        document.querySelectorAll('main > section').forEach((sec) => sec.classList.add('section-hidden'));
        document.getElementById('recipes').classList.remove('section-hidden');
      });
      li.appendChild(span);
      // Delete button
      const delBtn = document.createElement('button');
      delBtn.classList.add('close-btn');
      delBtn.title = 'Delete recipe';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        if (
          confirm(
            `Are you sure you want to delete the recipe "${recipe.title}"?`,
          )
        ) {
          // Remove from recipes
          recipes = recipes.filter((r) => r.id !== recipe.id);
          // Remove from any week plans referencing this recipe
          Object.values(weeks).forEach((wk) => {
            Object.values(wk.days).forEach((day) => {
              Object.keys(day.meals).forEach((mealKey) => {
                if (day.meals[mealKey].recipeId === recipe.id) {
                  day.meals[mealKey].recipeId = null;
                }
              });
            });
          });
          saveData();
          renderRecipeList();
          // Re‑render plan with current weekStart
          const weekStart = document.getElementById('week-start').value;
          if (weekStart) {
            renderPlan(getWeekStart(weekStart));
          }
          showToast(`Deleted recipe: ${recipe.title}`);
        }
      });
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  /**
   * Render the pantry list.
   */
  function renderPantry() {
    const listEl = document.getElementById('pantry-list');
    listEl.innerHTML = '';
    pantry.forEach((item) => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      // Compose display string: qty unit name (e.g. "2 cup flour")
      const unitObj = units.find((u) => u.id === item.unitId);
      const sectionObj = sections.find((s) => s.id === item.sectionId);
      const expiryStr = item.bestBefore ? ` (bb ${item.bestBefore})` : '';
      nameSpan.textContent = `${item.qty} ${unitObj ? unitObj.short : ''} ${
        item.name
      }${expiryStr}`;
      li.appendChild(nameSpan);
      const secSpan = document.createElement('span');
      secSpan.textContent = sectionObj ? sectionObj.name : '';
      secSpan.style.fontStyle = 'italic';
      secSpan.style.fontSize = '0.8rem';
      secSpan.style.color = 'var(--accent-dark)';
      li.appendChild(secSpan);
      const delBtn = document.createElement('button');
      delBtn.classList.add('close-btn');
      delBtn.title = 'Remove item';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        pantry = pantry.filter((p) => p.id !== item.id);
        saveData();
        renderPantry();
        // Notify the user
        showToast(`Removed from pantry: ${item.name}`);
      });
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  /**
   * Compute and render the grocery list for the selected week.
   */
  function generateGroceryList() {
    const weekStartInput = document.getElementById('week-start');
    if (!weekStartInput.value) {
      alert('Please select a week start date.');
      return;
    }
    const weekStart = getWeekStart(weekStartInput.value);
    ensureWeek(weekStart);
    const week = weeks[weekStart];
    const aggregated = {};
    // Aggregate ingredients from recipes
    Object.values(week.days).forEach((day) => {
      Object.values(day.meals).forEach((meal) => {
        if (meal.recipeId) {
          const recipe = recipes.find((r) => r.id === meal.recipeId);
          if (recipe) {
            recipe.ingredients.forEach((ing) => {
              const key = `${ing.name.toLowerCase()}|${ing.unitId}|${ing.sectionId}`;
              if (!aggregated[key]) {
                aggregated[key] = {
                  name: ing.name,
                  qty: parseFloat(ing.qty) || 0,
                  unitId: ing.unitId,
                  sectionId: ing.sectionId,
                  covered: false,
                };
              } else {
                aggregated[key].qty += parseFloat(ing.qty) || 0;
              }
            });
          }
        }
      });
    });
    // Subtract pantry quantities, with unit conversions
    Object.keys(aggregated).forEach((key) => {
      const item = aggregated[key];
      // Find matching pantry entries (same name, convertible units)
      pantry.forEach((p) => {
        if (p.name.toLowerCase() === item.name.toLowerCase()) {
          if (p.unitId === item.unitId) {
            item.qty -= parseFloat(p.qty || 0);
          } else {
            // Try converting pantry qty to item's unit
            const converted = convertUnit(parseFloat(p.qty || 0), p.unitId, item.unitId);
            if (converted !== null) {
              item.qty -= converted;
            }
          }
        }
      });
      if (item.qty <= 0) {
        item.covered = true;
        item.qty = 0;
      }
    });
    // Build list items array, merging carriedItems and preserving previous check state
    let items = Object.values(aggregated);
    // Include carried over items if present
    if (carriedItems && carriedItems.length > 0) {
      carriedItems.forEach((ci) => {
        // Attempt to find matching item by name and unit and section
        const idx = items.findIndex(
          (it) =>
            it.name.toLowerCase() === ci.name.toLowerCase() &&
            it.unitId === ci.unitId &&
            it.sectionId === ci.sectionId,
        );
        if (idx >= 0) {
          items[idx].qty += ci.qty;
          items[idx].covered = false;
        } else {
          // Clone carried item and mark as not covered
          items.push({ ...ci, covered: false, checked: ci.checked || false });
        }
      });
    }
    // Round quantities to 2 decimals
    items.forEach((i) => {
      i.qty = parseFloat(i.qty.toFixed(2));
    });
    // Remove any items that lack a valid name.  Old versions of the
    // application may have persisted blank entries, which would
    // otherwise appear as empty rows in the grocery list.  Skip
    // entries with no name or only whitespace.
    items = items.filter((i) => i.name && i.name.trim().length > 0);
    // Restore checked state from previous last list if same item exists
    items.forEach((i) => {
      i.checked = false;
      // Generate key to match previous list items
      const key = `${i.name.toLowerCase()}|${i.unitId}|${i.sectionId}`;
      if (lastList && lastList.items && lastList.weekStart === weekStart) {
        const prev = lastList.items.find(
          (pi) => `${pi.name.toLowerCase()}|${pi.unitId}|${pi.sectionId}` === key,
        );
        if (prev) {
          i.checked = prev.checked;
        }
      }
    });
    // Save lastList for this week
    lastList = { weekStart, items };
    saveData();
    // Show list controls
    document.getElementById('list-controls').classList.remove('section-hidden');
    // Uncheck hide toggles by default
    document.getElementById('hide-checked').checked = false;
    document.getElementById('hide-covered').checked = true;
    // Render interactive list
    renderGroceryList();
    showToast('Generated grocery list');
  }

  /**
   * Attach event listeners for navigation buttons to switch between
   * application sections.
   */
  function setupNavigation() {
    const navButtons = document.querySelectorAll('nav button');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        navButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-section');
        document
          .querySelectorAll('main > section')
          .forEach((sec) => sec.classList.add('section-hidden'));
        document.getElementById(target).classList.remove('section-hidden');
      });
    });
  }

  /**
   * Create a new empty ingredient row in the recipe form.
   */
  function addIngredientRow() {
    const container = document.getElementById('ingredients-container');
    const row = document.createElement('div');
    row.classList.add('ingredient-row');
    // Ingredient name
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Ingredient';
    nameInput.required = true;
    row.appendChild(nameInput);
    // Quantity
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = 'any';
    qtyInput.placeholder = 'Qty';
    qtyInput.required = true;
    row.appendChild(qtyInput);
    // Unit select
    const unitSelect = document.createElement('select');
    populateUnitSelect(unitSelect);
    row.appendChild(unitSelect);
    // Section select
    const sectionSelect = document.createElement('select');
    populateSectionSelect(sectionSelect);
    row.appendChild(sectionSelect);
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('close-btn');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      container.removeChild(row);
    });
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  /**
   * Initialise the recipe form and attach handlers.
   */
  function setupRecipeForm() {
    document
      .getElementById('add-ingredient')
      .addEventListener('click', addIngredientRow);
    // Start with one ingredient row
    addIngredientRow();
    const form = document.getElementById('recipe-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('recipe-title');
      const instInput = document.getElementById('recipe-instructions');
      const title = titleInput.value.trim();
      if (!title) {
        alert('Please provide a recipe title.');
        return;
      }
      const instructions = instInput.value.trim();
      // Gather ingredients
      const rows = document.querySelectorAll('#ingredients-container .ingredient-row');
      const ingList = [];
      rows.forEach((r) => {
        const [nameInput, qtyInput, unitSel, sectionSel] = r.querySelectorAll(
          'input, select',
        );
        const name = nameInput.value.trim();
        const qty = parseFloat(qtyInput.value);
        if (!name || isNaN(qty)) return;
        const unitId = unitSel.value;
        const sectionId = sectionSel.value;
        ingList.push({ name, qty, unitId, sectionId });
      });
      if (ingList.length === 0) {
        alert('Please add at least one ingredient.');
        return;
      }
      if (editingRecipeId) {
        // Update existing recipe
        const recipe = recipes.find((r) => r.id === editingRecipeId);
        if (recipe) {
          recipe.title = title;
          recipe.instructions = instructions;
          recipe.ingredients = ingList;
          // Also update any plans referencing this recipe by id - they will reference same id so no change needed
        }
        showToast(`Updated recipe: ${title}`);
      } else {
        // Create new recipe
        const newRecipe = {
          id: generateId(),
          title,
          instructions,
          ingredients: ingList,
        };
        recipes.push(newRecipe);
        showToast(`Saved recipe: ${title}`);
      }
      saveData();
      // Reset editing state and form
      editingRecipeId = null;
      document.querySelector('#recipe-form button.primary').textContent = 'Save Recipe';
      document.getElementById('cancel-edit').classList.add('section-hidden');
      // Clear form fields
      titleInput.value = '';
      instInput.value = '';
      document.getElementById('ingredients-container').innerHTML = '';
      addIngredientRow();
      renderRecipeList();
      // Re‑render plan selects to include the new or updated recipe
      const weekStartVal = document.getElementById('week-start').value;
      if (weekStartVal) {
        renderPlan(getWeekStart(weekStartVal));
      }
    });
    // Cancel edit handler
    document.getElementById('cancel-edit').addEventListener('click', () => {
      editingRecipeId = null;
      document.querySelector('#recipe-form button.primary').textContent = 'Save Recipe';
      document.getElementById('cancel-edit').classList.add('section-hidden');
      // Reset form
      form.reset();
      document.getElementById('ingredients-container').innerHTML = '';
      addIngredientRow();
    });
  }

  /**
   * Initialise pantry form and attach handlers.
   */
  function setupPantryForm() {
    // Populate selects
    populateUnitSelect(document.getElementById('pantry-unit'));
    populateSectionSelect(document.getElementById('pantry-section'));
    const form = document.getElementById('pantry-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('pantry-name').value.trim();
      const qty = parseFloat(document.getElementById('pantry-qty').value);
      const unitId = document.getElementById('pantry-unit').value;
      const sectionId = document.getElementById('pantry-section').value;
      const bestBefore = document.getElementById('pantry-date').value || null;
      if (!name || isNaN(qty)) {
        alert('Please provide an item name and quantity.');
        return;
      }
      pantry.push({
        id: generateId(),
        name,
        qty,
        unitId,
        sectionId,
        bestBefore,
      });
      saveData();
      // Clear form
      form.reset();
      // Reset selects to default first option
      populateUnitSelect(document.getElementById('pantry-unit'));
      populateSectionSelect(document.getElementById('pantry-section'));
      renderPantry();
      // Provide feedback to the user
      showToast(`Added to pantry: ${name}`);
    });
  }

  /**
   * Initialise week start input and plan rendering.
   */
  function setupWeekPlan() {
    const weekStartInput = document.getElementById('week-start');
    // Prefill with current week's Monday if not already set
    if (!weekStartInput.value) {
      const today = new Date();
      const iso = today.toISOString().substr(0, 10);
      weekStartInput.value = getWeekStart(iso);
    }
    const initialWeek = getWeekStart(weekStartInput.value);
    renderPlan(initialWeek);
    weekStartInput.addEventListener('change', () => {
      const ws = getWeekStart(weekStartInput.value);
      // If we have a previous list with unchecked items and are changing to a new week, ask to carry forward
      if (lastList && lastList.weekStart && lastList.items && lastList.items.length > 0 && lastList.weekStart !== ws) {
        const leftovers = lastList.items.filter((i) => !i.checked && i.qty > 0);
        if (leftovers.length > 0) {
          const confirmCarry = confirm(
            'Carry forward leftover items from your previous list into the new week?\nThese items were not checked off in your last list.',
          );
          if (confirmCarry) {
            carriedItems = leftovers.map((i) => ({ ...i }));
            // Optionally clear them from lastList or mark them as checked
          } else {
            carriedItems = [];
          }
        } else {
          carriedItems = [];
        }
      }
      renderPlan(ws);
    });
  }

  /**
   * Set up the grocery list button.
   */
  function setupGroceryList() {
    document
      .getElementById('generate-list')
      .addEventListener('click', generateGroceryList);
    // List control toggles
    document.getElementById('hide-checked').addEventListener('change', () => {
      renderGroceryList();
    });
    document.getElementById('hide-covered').addEventListener('change', () => {
      renderGroceryList();
    });
    // Copy list to clipboard
    document.getElementById('copy-list').addEventListener('click', () => {
      const plainText = buildPlainList();
      navigator.clipboard
        .writeText(plainText)
        .then(() => showToast('List copied to clipboard'))
        .catch(() => alert('Failed to copy'));
    });
    // Print list
    document.getElementById('print-list').addEventListener('click', () => {
      window.print();
    });
  }

  /**
   * Set up export and import buttons in Settings section.
   */
  function setupSettings() {
    const exportBtn = document.getElementById('export-data');
    const importBtn = document.getElementById('import-data');
    const fileInput = document.getElementById('import-file');
    exportBtn.addEventListener('click', () => {
      const data = {
        recipes,
        pantry,
        weeks,
        lastList,
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().substr(0, 10);
      a.download = `grocery_planner_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup downloaded');
    });
    importBtn.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          recipes = data.recipes || [];
          pantry = data.pantry || [];
          weeks = data.weeks || {};
          lastList = data.lastList || { weekStart: null, items: [] };
          saveData();
          // Rebuild UI
          renderRecipeList();
          renderPantry();
          const wsInput = document.getElementById('week-start');
          if (wsInput.value) {
            const ws = getWeekStart(wsInput.value);
            renderPlan(ws);
          }
          // If a list was previously saved for this week, render it
          if (lastList && lastList.weekStart === getWeekStart(wsInput.value)) {
            document.getElementById('list-controls').classList.remove('section-hidden');
            renderGroceryList();
          }
          showToast('Data imported successfully');
        } catch (err) {
          alert('Failed to import data: invalid file format');
        }
      };
      reader.readAsText(file);
    });
  }

  /**
   * Build a plain text representation of the current grocery list for copying.
   * Groups items by section and respects the hide toggles.
   */
  function buildPlainList() {
    if (!lastList || !lastList.items) return '';
    const hideChecked = document.getElementById('hide-checked').checked;
    const hideCovered = document.getElementById('hide-covered').checked;
    // Group by section
    const groups = {};
    lastList.items.forEach((item) => {
      if (hideCovered && item.covered) return;
      if (hideChecked && item.checked) return;
      const sec = item.sectionId || 'misc';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(item);
    });
    let text = '';
    const sortedSections = sections.slice().sort((a, b) => a.sort - b.sort);
    sortedSections.forEach((sec) => {
      if (groups[sec.id] && groups[sec.id].length > 0) {
        text += `${sec.name}\n`;
        groups[sec.id].forEach((item) => {
          const unitObj = units.find((u) => u.id === item.unitId);
          text += `- ${item.qty} ${unitObj ? unitObj.short : ''} ${item.name}\n`;
        });
        text += '\n';
      }
    });
    // Other sections
    Object.keys(groups).forEach((secId) => {
      if (!sections.find((s) => s.id === secId)) {
        text += 'Other\n';
        groups[secId].forEach((item) => {
          const unitObj = units.find((u) => u.id === item.unitId);
          text += `- ${item.qty} ${unitObj ? unitObj.short : ''} ${item.name}\n`;
        });
        text += '\n';
      }
    });
    return text.trim();
  }

  /**
   * Render the grocery list interactively with checkboxes and section headers.
   */
  function renderGroceryList() {
    const listEl = document.getElementById('grocery-list');
    listEl.innerHTML = '';
    if (!lastList || !lastList.items) return;
    const hideChecked = document.getElementById('hide-checked').checked;
    const hideCovered = document.getElementById('hide-covered').checked;
    // Group items by section
    const groups = {};
    lastList.items.forEach((item, idx) => {
      // Skip invalid items without a name to avoid blank rows
      if (!item || !item.name || item.name.trim().length === 0) return;
      // Determine whether to include this item based on toggles
      if (hideCovered && item.covered) return;
      if (hideChecked && item.checked) return;
      const sec = item.sectionId || 'misc';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push({ ...item, index: idx });
    });
    const sortedSections = sections.slice().sort((a, b) => a.sort - b.sort);
    // Render known sections first
    sortedSections.forEach((sec) => {
      if (groups[sec.id] && groups[sec.id].length > 0) {
        const header = document.createElement('li');
        header.textContent = sec.name;
        header.style.fontWeight = 'bold';
        listEl.appendChild(header);
        groups[sec.id].forEach((item) => {
          const li = document.createElement('li');
          if (item.covered) li.classList.add('covered');
          // Create checkbox and label
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          const checkboxId = `gl-${item.index}`;
          checkbox.id = checkboxId;
          checkbox.checked = !!item.checked;
          checkbox.addEventListener('change', () => {
            lastList.items[item.index].checked = checkbox.checked;
            saveData();
            // If hideChecked is on, hide item on check
            if (document.getElementById('hide-checked').checked) {
              renderGroceryList();
            }
          });
          const label = document.createElement('label');
          label.setAttribute('for', checkboxId);
          const unitObj = units.find((u) => u.id === item.unitId);
          label.textContent = `${item.qty} ${unitObj ? unitObj.short : ''} ${item.name}`;
          li.appendChild(checkbox);
          li.appendChild(label);
          listEl.appendChild(li);
        });
      }
    });
    // Render unknown sections
    Object.keys(groups).forEach((secId) => {
      if (!sections.find((s) => s.id === secId)) {
        const header = document.createElement('li');
        header.textContent = 'Other';
        header.style.fontWeight = 'bold';
        listEl.appendChild(header);
        groups[secId].forEach((item) => {
          const li = document.createElement('li');
          if (item.covered) li.classList.add('covered');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          const checkboxId = `gl-${item.index}`;
          checkbox.id = checkboxId;
          checkbox.checked = !!item.checked;
          checkbox.addEventListener('change', () => {
            lastList.items[item.index].checked = checkbox.checked;
            saveData();
            if (document.getElementById('hide-checked').checked) {
              renderGroceryList();
            }
          });
          const label = document.createElement('label');
          label.setAttribute('for', checkboxId);
          const unitObj = units.find((u) => u.id === item.unitId);
          label.textContent = `${item.qty} ${unitObj ? unitObj.short : ''} ${item.name}`;
          li.appendChild(checkbox);
          li.appendChild(label);
          listEl.appendChild(li);
        });
      }
    });
  }

  // Initialisation sequence
  loadData();
  setupNavigation();
  setupRecipeForm();
  setupPantryForm();
  setupWeekPlan();
  setupGroceryList();
  setupSettings();
  renderRecipeList();
  renderPantry();
});