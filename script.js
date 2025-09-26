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
  }

  /**
   * Persist in‑memory data back to localStorage.
   */
  function saveData() {
    localStorage.setItem('gp_recipes', JSON.stringify(recipes));
    localStorage.setItem('gp_pantry', JSON.stringify(pantry));
    localStorage.setItem('gp_weeks', JSON.stringify(weeks));
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
      const span = document.createElement('span');
      span.textContent = recipe.title;
      li.appendChild(span);
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
                };
              } else {
                aggregated[key].qty += parseFloat(ing.qty) || 0;
              }
            });
          }
        }
      });
    });
    // Subtract pantry quantities
    Object.keys(aggregated).forEach((key) => {
      const item = aggregated[key];
      // Find matching pantry entries (same name and unit)
      const pantryMatches = pantry.filter(
        (p) => p.name.toLowerCase() === item.name.toLowerCase() && p.unitId === item.unitId,
      );
      const totalPantryQty = pantryMatches.reduce(
        (sum, p) => sum + parseFloat(p.qty || 0),
        0,
      );
      item.qty = item.qty - totalPantryQty;
    });
    // Remove items with zero or negative qty
    const needed = Object.values(aggregated).filter((i) => i.qty > 0);
    // Group by section
    const groups = {};
    needed.forEach((item) => {
      const sec = item.sectionId || 'misc';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(item);
    });
    // Sort groups by predefined section order
    const sortedSections = sections.slice().sort((a, b) => a.sort - b.sort);
    const listEl = document.getElementById('grocery-list');
    listEl.innerHTML = '';
    sortedSections.forEach((sec) => {
      if (groups[sec.id] && groups[sec.id].length > 0) {
        // Section header
        const header = document.createElement('li');
        header.textContent = sec.name;
        header.style.fontWeight = 'bold';
        listEl.appendChild(header);
        groups[sec.id].forEach((item) => {
          const li = document.createElement('li');
          // Format quantity with up to 2 decimals
          const qtyStr = parseFloat(item.qty.toFixed(2));
          const unitObj = units.find((u) => u.id === item.unitId);
          li.textContent = `${qtyStr} ${unitObj ? unitObj.short : ''} ${item.name}`;
          listEl.appendChild(li);
        });
      }
    });
    // Misc group for any other items not mapped to known sections
    Object.keys(groups).forEach((secId) => {
      if (!sections.find((s) => s.id === secId) && groups[secId].length > 0) {
        const header = document.createElement('li');
        header.textContent = 'Other';
        header.style.fontWeight = 'bold';
        listEl.appendChild(header);
        groups[secId].forEach((item) => {
          const li = document.createElement('li');
          const qtyStr = parseFloat(item.qty.toFixed(2));
          const unitObj = units.find((u) => u.id === item.unitId);
          li.textContent = `${qtyStr} ${unitObj ? unitObj.short : ''} ${item.name}`;
          listEl.appendChild(li);
        });
      }
    });
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
      const newRecipe = {
        id: generateId(),
        title,
        instructions,
        ingredients: ingList,
      };
      recipes.push(newRecipe);
      saveData();
      // Reset form
      titleInput.value = '';
      instInput.value = '';
      document.getElementById('ingredients-container').innerHTML = '';
      addIngredientRow();
      renderRecipeList();
      // Re‑render plan selects to include the new recipe
      const weekStartVal = document.getElementById('week-start').value;
      if (weekStartVal) {
        renderPlan(getWeekStart(weekStartVal));
      }
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
  }

  // Initialisation sequence
  loadData();
  setupNavigation();
  setupRecipeForm();
  setupPantryForm();
  setupWeekPlan();
  setupGroceryList();
  renderRecipeList();
  renderPantry();
});