// Local storage keys
const FF_PEOPLE_KEY = "familyFavorites_people";
const FF_CATEGORIES_KEY = "familyFavorites_categories";
const FF_FAVORITES_KEY = "familyFavorites_favorites";
const FF_LAST_BACKUP_KEY = "familyFavorites_lastBackup";

let people = [];      // {id, name, archived: boolean}
let categories = [];  // {id, name, archived: boolean}
let favorites = {};   // { [categoryId]: { [personId]: string } }

let currentCategoryId = null;
let toastTimeout = null;

/* ---------- Utility: localStorage safe wrappers ---------- */
function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    console.error("localStorage get error:", e);
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.error("localStorage set error:", e);
  }
}

/* ---------- Initialization ---------- */

function loadData() {
  // People
  const rawPeople = safeGet(FF_PEOPLE_KEY);
  if (rawPeople) {
    try {
      people = JSON.parse(rawPeople);
      if (!Array.isArray(people)) people = [];
    } catch (e) {
      console.error("Error parsing people:", e);
      people = [];
    }
  } else {
    // default: no people (user can add)
    people = [];
  }

  // Categories
  const rawCategories = safeGet(FF_CATEGORIES_KEY);
  if (rawCategories) {
    try {
      categories = JSON.parse(rawCategories);
      if (!Array.isArray(categories)) categories = [];
    } catch (e) {
      console.error("Error parsing categories:", e);
      categories = [];
    }
  } else {
    // Initialize with some examples
    categories = [
      { id: "cat_candy", name: "Candy", archived: false },
      { id: "cat_icecream", name: "Ice Cream", archived: false },
      { id: "cat_snack", name: "Snack", archived: false },
      { id: "cat_fastfood", name: "Fast Food", archived: false },
      { id: "cat_movie", name: "Movie", archived: false },
      { id: "cat_tv", name: "TV Show", archived: false }
    ];
  }

  // Favorites
  const rawFavorites = safeGet(FF_FAVORITES_KEY);
  if (rawFavorites) {
    try {
      favorites = JSON.parse(rawFavorites);
      if (!favorites || typeof favorites !== "object") favorites = {};
    } catch (e) {
      console.error("Error parsing favorites:", e);
      favorites = {};
    }
  } else {
    favorites = {};
  }

  // Choose an initial category if possible
  const activeCategories = getActiveCategories();
  if (activeCategories.length > 0) {
    currentCategoryId = activeCategories[0].id;
  } else {
    currentCategoryId = null;
  }
}

function savePeople() {
  safeSet(FF_PEOPLE_KEY, JSON.stringify(people));
}

function saveCategories() {
  safeSet(FF_CATEGORIES_KEY, JSON.stringify(categories));
}

function saveFavorites() {
  safeSet(FF_FAVORITES_KEY, JSON.stringify(favorites));
}

/* ---------- Helpers ---------- */

function getActiveCategories() {
  return categories.filter((c) => !c.archived);
}

function getActivePeople() {
  return people.filter((p) => !p.archived);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLocalDateTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* ---------- Backup / Reminder ---------- */

function recordBackupTime() {
  const nowIso = new Date().toISOString();
  safeSet(FF_LAST_BACKUP_KEY, nowIso);
}

function getLastBackupTime() {
  const raw = safeGet(FF_LAST_BACKUP_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d;
}

function updateBackupReminder() {
  const reminder = document.getElementById("backupReminder");
  if (!reminder) return;

  const lastBackup = getLastBackupTime();
  const now = new Date();

  if (!lastBackup) {
    reminder.innerHTML =
      'No backup yet. <button id="backupNowBtn" class="small-btn secondary-btn">Backup now</button>';
  } else {
    const diffMs = now - lastBackup;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (diffMs > oneDayMs) {
      reminder.innerHTML =
        'It’s been more than a day since your last backup (' +
        formatLocalDateTime(lastBackup.toISOString()) +
        '). <button id="backupNowBtn" class="small-btn secondary-btn">Backup now</button>';
    } else {
      reminder.textContent = "Last backup: " + formatLocalDateTime(lastBackup.toISOString());
    }
  }

  // Wire the backupNow button if present
  const backupNowBtn = document.getElementById("backupNowBtn");
  if (backupNowBtn) {
    backupNowBtn.addEventListener("click", exportFamilyFavoritesData);
  }
}

/* ---------- Magical Backup Modal ---------- */

function openBackupModal(json) {
  const backdrop = document.getElementById("backupModal");
  const textarea = document.getElementById("backupModalTextarea");
  if (!backdrop || !textarea) return;

  textarea.value = json;
  backdrop.classList.add("visible");

  // Optional: auto-select content for easy copy
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 20);
}

function closeBackupModal() {
  const backdrop = document.getElementById("backupModal");
  if (!backdrop) return;
  backdrop.classList.remove("visible");
}

/* ---------- Rendering: Category Select & Hint ---------- */

function renderCategorySelect() {
  const select = document.getElementById("categorySelect");
  const hint = document.getElementById("categoryHint");
  if (!select || !hint) return;

  const activeCats = getActiveCategories();
  select.innerHTML = "";

  if (activeCats.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No types yet";
    select.appendChild(opt);
    select.disabled = true;
    hint.textContent = "Add a favorite type in settings (⚙️) to begin.";
    currentCategoryId = null;
    renderFavoritesList();
    return;
  }

  select.disabled = false;

  activeCats.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });

  if (!currentCategoryId || !activeCats.some((c) => c.id === currentCategoryId)) {
    currentCategoryId = activeCats[0].id;
  }

  select.value = currentCategoryId;

  const current = activeCats.find((c) => c.id === currentCategoryId);
  if (current) {
    hint.textContent = `Showing favorites for: ${current.name}`;
  } else {
    hint.textContent = "Choose a favorite type above.";
  }

  renderFavoritesList();
}

/* ---------- Rendering: Favorites List ---------- */

function renderFavoritesList() {
  const list = document.getElementById("favoritesList");
  if (!list) return;
  list.innerHTML = "";

  const activePeople = getActivePeople();

  if (!currentCategoryId) {
    list.innerHTML = '<p class="widget-footer-text">No favorite type selected yet.</p>';
    return;
  }

  if (activePeople.length === 0) {
    list.innerHTML = '<p class="widget-footer-text">No family members yet. Add one below.</p>';
    return;
  }

  const categoryFavorites = favorites[currentCategoryId] || {};
  activePeople.forEach((person) => {
    const row = document.createElement("div");
    row.className = "favorite-row";

    const label = document.createElement("div");
    label.className = "favorite-row-label";
    label.innerHTML = `<span>${escapeHtml(person.name)}</span>`;

    const input = document.createElement("input");
    input.className = "favorite-row-input";
    input.type = "text";
    input.placeholder = "Their favorite...";
    input.value = categoryFavorites[person.id] || "";

    input.addEventListener("input", function () {
      updateFavorite(currentCategoryId, person.id, input.value);
    });

    row.appendChild(label);
    row.appendChild(input);
    list.appendChild(row);
  });
}

function updateFavorite(categoryId, personId, value) {
  if (!favorites[categoryId]) {
    favorites[categoryId] = {};
  }
  favorites[categoryId][personId] = value;
  saveFavorites();
}

/* ---------- Add Person (main + settings) ---------- */

function handleAddPersonFromMain() {
  const input = document.getElementById("newPersonInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    showToast("Enter a name before adding.");
    return;
  }

  addPerson(name);
  input.value = "";
}

function handleAddPersonFromSettings() {
  const input = document.getElementById("settingsNewPersonInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    showToast("Enter a name before adding.");
    return;
  }

  addPerson(name);
  input.value = "";
}

function addPerson(name) {
  const id = "person_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  people.push({ id, name, archived: false });
  savePeople();
  showToast(`Added ${name}.`);
  renderPeopleManageList();
  renderFavoritesList();
}

/* ---------- Add Category (settings) ---------- */

function handleAddCategoryFromSettings() {
  const input = document.getElementById("settingsNewCategoryInput");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    showToast("Enter a favorite type before adding.");
    return;
  }

  addCategory(name);
  input.value = "";
}

function addCategory(name) {
  const id = "cat_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  categories.push({ id, name, archived: false });
  saveCategories();
  showToast(`Added favorite type: ${name}.`);
  renderCategoriesManageList();
  renderCategorySelect();
}

/* ---------- Manage People (archive / restore / delete) ---------- */

function renderPeopleManageList() {
  const container = document.getElementById("peopleList");
  if (!container) return;

  if (people.length === 0) {
    container.innerHTML = '<p class="widget-footer-text">No family members yet.</p>';
    return;
  }

  let html = "";
  people.forEach((p) => {
    html += `
      <div class="manage-row">
        <div>
          <div class="manage-name">${escapeHtml(p.name)}</div>
          <div class="manage-status">${p.archived ? "Archived" : "Active"}</div>
        </div>
        <div class="manage-actions">
          ${
            p.archived
              ? `<button class="small-btn" data-action="restorePerson" data-id="${p.id}">Restore</button>`
              : `<button class="small-btn secondary-btn" data-action="archivePerson" data-id="${p.id}">Archive</button>`
          }
          <button class="small-btn secondary-btn" data-action="deletePerson" data-id="${p.id}">Delete</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    btn.addEventListener("click", function () {
      if (action === "archivePerson") archivePerson(id);
      if (action === "restorePerson") restorePerson(id);
      if (action === "deletePerson") deletePerson(id);
    });
  });
}

function archivePerson(id) {
  const person = people.find((p) => p.id === id);
  if (!person) return;
  person.archived = true;
  savePeople();
  showToast(`Archived ${person.name}.`);
  renderPeopleManageList();
  renderFavoritesList();
}

function restorePerson(id) {
  const person = people.find((p) => p.id === id);
  if (!person) return;
  person.archived = false;
  savePeople();
  showToast(`Restored ${person.name}.`);
  renderPeopleManageList();
  renderFavoritesList();
}

function deletePerson(id) {
  const person = people.find((p) => p.id === id);
  if (person) {
    showToast(`Deleted ${person.name}.`);
  }
  people = people.filter((p) => p.id !== id);
  // remove from favorites
  Object.keys(favorites).forEach((catId) => {
    if (favorites[catId] && favorites[catId][id] !== undefined) {
      delete favorites[catId][id];
    }
  });
  savePeople();
  saveFavorites();
  renderPeopleManageList();
  renderFavoritesList();
}

/* ---------- Manage Categories (archive / restore / delete) ---------- */

function renderCategoriesManageList() {
  const container = document.getElementById("categoriesList");
  if (!container) return;

  if (categories.length === 0) {
    container.innerHTML = '<p class="widget-footer-text">No favorite types yet.</p>';
    return;
  }

  let html = "";
  categories.forEach((c) => {
    html += `
      <div class="manage-row">
        <div>
          <div class="manage-name">${escapeHtml(c.name)}</div>
          <div class="manage-status">${c.archived ? "Archived" : "Active"}</div>
        </div>
        <div class="manage-actions">
          ${
            c.archived
              ? `<button class="small-btn" data-action="restoreCategory" data-id="${c.id}">Restore</button>`
              : `<button class="small-btn secondary-btn" data-action="archiveCategory" data-id="${c.id}">Archive</button>`
          }
          <button class="small-btn secondary-btn" data-action="deleteCategory" data-id="${c.id}">Delete</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    btn.addEventListener("click", function () {
      if (action === "archiveCategory") archiveCategory(id);
      if (action === "restoreCategory") restoreCategory(id);
      if (action === "deleteCategory") deleteCategory(id);
    });
  });
}

function archiveCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return;
  cat.archived = true;
  saveCategories();
  showToast(`Archived favorite type: ${cat.name}.`);
  if (currentCategoryId === id) {
    const activeCats = getActiveCategories();
    currentCategoryId = activeCats.length > 0 ? activeCats[0].id : null;
  }
  renderCategoriesManageList();
  renderCategorySelect();
}

function restoreCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return;
  cat.archived = false;
  saveCategories();
  showToast(`Restored favorite type: ${cat.name}.`);
  renderCategoriesManageList();
  renderCategorySelect();
}

function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (cat) {
    showToast(`Deleted favorite type: ${cat.name}.`);
  }
  categories = categories.filter((c) => c.id !== id);
  if (favorites[id]) {
    delete favorites[id];
  }
  if (currentCategoryId === id) {
    const activeCats = getActiveCategories();
    currentCategoryId = activeCats.length > 0 ? activeCats[0].id : null;
  }
  saveCategories();
  saveFavorites();
  renderCategoriesManageList();
  renderCategorySelect();
}

/* ---------- Settings Panel ---------- */

function setupSettingsToggle() {
  const toggle = document.getElementById("settingsToggle");
  const panel = document.getElementById("settingsPanel");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

/* ---------- Random Functions ---------- */

function setupRandomButtons() {
  const randomCategoryBtn = document.getElementById("randomCategoryBtn");
  const randomPersonBtn = document.getElementById("randomPersonBtn");
  const randomFavoriteBtn = document.getElementById("randomFavoriteBtn");

  if (randomCategoryBtn) {
    randomCategoryBtn.addEventListener("click", randomCategory);
  }

  if (randomPersonBtn) {
    randomPersonBtn.addEventListener("click", randomPerson);
  }

  if (randomFavoriteBtn) {
    randomFavoriteBtn.addEventListener("click", randomFavorite);
  }
}

function randomCategory() {
  const activeCats = getActiveCategories();
  if (activeCats.length === 0) {
    showToast("No favorite types available.");
    return;
  }
  const idx = Math.floor(Math.random() * activeCats.length);
  currentCategoryId = activeCats[idx].id;
  showToast(`Random type: ${activeCats[idx].name}`);
  renderCategorySelect();
}

function randomPerson() {
  const activePeople = getActivePeople();
  if (activePeople.length === 0) {
    showToast("No family members yet.");
    return;
  }
  const idx = Math.floor(Math.random() * activePeople.length);
  const person = activePeople[idx];
  const highlight = document.getElementById("randomHighlight");
  if (highlight) {
    highlight.innerHTML = `<span class="random-highlight-strong">Random person:</span> ${escapeHtml(person.name)}`;
  }
  showToast(`Tonight’s star: ${person.name}`);
}

function randomFavorite() {
  const activePeople = getActivePeople();
  const activeCats = getActiveCategories();

  if (activePeople.length === 0 || activeCats.length === 0) {
    showToast("Need at least one person and one type.");
    return;
  }

  const activePeopleMap = {};
  activePeople.forEach((p) => (activePeopleMap[p.id] = p));

  const activeCatMap = {};
  activeCats.forEach((c) => (activeCatMap[c.id] = c));

  const pool = [];

  Object.keys(favorites).forEach((catId) => {
    if (!activeCatMap[catId]) return;
    const catFavs = favorites[catId] || {};
    Object.keys(catFavs).forEach((personId) => {
      if (!activePeopleMap[personId]) return;
      const val = (catFavs[personId] || "").trim();
      if (val.length > 0) {
        pool.push({
          categoryId: catId,
          categoryName: activeCatMap[catId].name,
          personId,
          personName: activePeopleMap[personId].name,
          value: val
        });
      }
    });
  });

  if (pool.length === 0) {
    showToast("No favorites filled in yet.");
    return;
  }

  const idx = Math.floor(Math.random() * pool.length);
  const pick = pool[idx];

  const highlight = document.getElementById("randomHighlight");
  if (highlight) {
    highlight.innerHTML =
      `<span class="random-highlight-strong">Tonight’s pick:</span> ` +
      `${escapeHtml(pick.personName)} → ` +
      `${escapeHtml(pick.value)} ` +
      `<span class="random-highlight-strong">(${escapeHtml(pick.categoryName)})</span>`;
  }

  showToast("Random favorite chosen!");
}

/* ---------- Import / Export ---------- */

function exportFamilyFavoritesData() {
  const backup = {
    people,
    categories,
    favorites
  };

  // Prettified JSON for easier reading
  const json = JSON.stringify(backup, null, 2);

  const afterExport = (message) => {
    recordBackupTime();
    updateBackupReminder();
    if (message) showToast(message);
  };

  // Try clipboard first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json)
      .then(() => {
        afterExport("Family Favorites data copied to clipboard.");
      })
      .catch(() => {
        // Clipboard blocked (e.g., Notion Desktop) → show modal
        openBackupModal(json);
        afterExport("Backup ready – copy from the panel.");
      });
  } else {
    // Clipboard API not available → modal fallback
    openBackupModal(json);
    afterExport("Backup ready – copy from the panel.");
  }
}

function importFamilyFavoritesData() {
  const raw = window.prompt(
    "Paste your Family Favorites backup JSON here.\n\nThis will replace your current data:"
  );
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !Array.isArray(parsed.people) ||
      !Array.isArray(parsed.categories) ||
      typeof parsed.favorites !== "object"
    ) {
      showToast("Invalid backup format.");
      return;
    }

    people = parsed.people;
    categories = parsed.categories;
    favorites = parsed.favorites;

    savePeople();
    saveCategories();
    saveFavorites();

    const activeCats = getActiveCategories();
    currentCategoryId = activeCats.length > 0 ? activeCats[0].id : null;

    renderPeopleManageList();
    renderCategoriesManageList();
    renderCategorySelect();
    updateBackupReminder();

    showToast("Family Favorites data imported.");
  } catch (e) {
    console.error("Error importing data:", e);
    showToast("Error importing data. Check the JSON and try again.");
  }
}

/* ---------- Event wiring ---------- */

document.addEventListener("DOMContentLoaded", function () {
  loadData();

  // Render initial UI
  renderCategorySelect();
  renderPeopleManageList();
  renderCategoriesManageList();
  updateBackupReminder();

  // Category select change
  const catSelect = document.getElementById("categorySelect");
  if (catSelect) {
    catSelect.addEventListener("change", function () {
      currentCategoryId = catSelect.value || null;
      renderCategorySelect();
    });
  }

  // Add person (main)
  const addPersonBtn = document.getElementById("addPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", handleAddPersonFromMain);
  }
  const newPersonInput = document.getElementById("newPersonInput");
  if (newPersonInput) {
    newPersonInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddPersonFromMain();
      }
    });
  }

  // Add person (settings)
  const settingsAddPersonBtn = document.getElementById("settingsAddPersonBtn");
  if (settingsAddPersonBtn) {
    settingsAddPersonBtn.addEventListener("click", handleAddPersonFromSettings);
  }
  const settingsNewPersonInput = document.getElementById("settingsNewPersonInput");
  if (settingsNewPersonInput) {
    settingsNewPersonInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddPersonFromSettings();
      }
    });
  }

  // Add category (settings)
  const settingsAddCategoryBtn = document.getElementById("settingsAddCategoryBtn");
  if (settingsAddCategoryBtn) {
    settingsAddCategoryBtn.addEventListener("click", handleAddCategoryFromSettings);
  }
  const settingsNewCategoryInput = document.getElementById("settingsNewCategoryInput");
  if (settingsNewCategoryInput) {
    settingsNewCategoryInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddCategoryFromSettings();
      }
    });
  }

  // Import / Export buttons
  const exportBtn = document.getElementById("exportDataBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportFamilyFavoritesData);
  }

  const importBtn = document.getElementById("importDataBtn");
  if (importBtn) {
    importBtn.addEventListener("click", importFamilyFavoritesData);
  }

  // Settings panel
  setupSettingsToggle();
  setupRandomButtons();

  // Backup modal controls
  const backupModalCloseBtn = document.getElementById("backupModalCloseBtn");
  const backupModalSelectBtn = document.getElementById("backupModalSelectBtn");
  const backupBackdrop = document.getElementById("backupModal");
  const backupTextarea = document.getElementById("backupModalTextarea");

  if (backupModalCloseBtn) {
    backupModalCloseBtn.addEventListener("click", closeBackupModal);
  }

  if (backupModalSelectBtn && backupTextarea) {
    backupModalSelectBtn.addEventListener("click", () => {
      backupTextarea.focus();
      backupTextarea.select();
    });
  }

  if (backupBackdrop) {
    backupBackdrop.addEventListener("click", (e) => {
      if (e.target === backupBackdrop) {
        closeBackupModal();
      }
    });
  }
});
