/* =========================
   Lumo's Trello (Vanilla JS)
   - Lists + cards
   - Add/edit/delete
   - Drag & drop across lists
   - Category badges + due dates
   - Export/Import JSON (file)
   - Persists to localStorage
   ========================= */

const STORAGE_KEY_V2 = "lumo_trello_board_v2";
const STORAGE_KEY_OLD = "mini_trello_board_v1";

const CATEGORY_OPTIONS = [
  { key: "assignment", label: "Assignment" },
  { key: "lab", label: "Lab" },
  { key: "project", label: "Project" },
  { key: "mod", label: "Mod" },
  { key: "unfinished", label: "Unfinished" },
];

const els = {
  board: document.querySelector("#board"),
  addListForm: document.querySelector("#addListForm"),
  listTitleInput: document.querySelector("#listTitleInput"),
  resetBtn: document.querySelector("#resetBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  toast: document.querySelector("#toast"),
};

let state = loadStateV2() ?? migrateFromOldState(loadOldState()) ?? starterStateV2();

/**
 * V2 State shape:
 * state = {
 *   version: 2,
 *   lists: [{ id, title, cardIds: [] }, ...],
 *   cards: { [cardId]: { id, title, createdAt, category, dueDate } }
 * }
 */

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDue(dueDate) {
  if (!dueDate) return null;
  // dueDate is "YYYY-MM-DD"
  const d = new Date(dueDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => els.toast.classList.remove("show"), 1600);
}

/* ---------- Persistence ---------- */
function saveStateV2() {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
}

function loadStateV2() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadOldState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OLD);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function migrateFromOldState(old) {
  if (!old || !old.lists || !old.cards) return null;

  const migrated = {
    version: 2,
    lists: old.lists.map((l) => ({
      id: l.id ?? uid("list"),
      title: l.title ?? "Untitled",
      cardIds: Array.isArray(l.cardIds) ? l.cardIds.slice() : [],
    })),
    cards: {},
  };

  for (const [id, card] of Object.entries(old.cards)) {
    migrated.cards[id] = {
      id: card.id ?? id,
      title: card.title ?? "Untitled",
      createdAt: card.createdAt ?? nowISO(),
      category: "project", // sensible default when upgrading
      dueDate: null,
    };
  }

  // Save migrated board into V2 and keep old key untouched
  state = migrated;
  saveStateV2();
  toast("Upgraded saved board → Lumo’s Trello");
  return migrated;
}

/* ---------- Starter board ---------- */
function starterStateV2() {
  const mkCard = (title, category, dueDate = null) => {
    const id = uid("card");
    return [id, { id, title, createdAt: nowISO(), category, dueDate }];
  };

  const [c1id, c1] = mkCard("Add your assignments for the week", "assignment");
  const [c2id, c2] = mkCard("Track GA labs you haven’t finished", "lab");
  const [c3id, c3] = mkCard("Ship Mod-Vault features (UI/UX)", "project");
  const [c4id, c4] = mkCard("Unfinished mod tasks (Bannerlord/BG3/etc.)", "mod");
  const [c5id, c5] = mkCard("Move old tasks here when paused", "unfinished");

  const l1 = uid("list");
  const l2 = uid("list");
  const l3 = uid("list");
  const l4 = uid("list");
  const l5 = uid("list");

  return {
    version: 2,
    lists: [
      { id: l1, title: "📘 Assignments", cardIds: [c1id] },
      { id: l2, title: "🧪 Labs", cardIds: [c2id] },
      { id: l3, title: "🛠 Projects", cardIds: [c3id] },
      { id: l4, title: "🧩 Mods", cardIds: [c4id] },
      { id: l5, title: "💤 Unfinished", cardIds: [c5id] },
    ],
    cards: {
      [c1id]: c1,
      [c2id]: c2,
      [c3id]: c3,
      [c4id]: c4,
      [c5id]: c5,
    },
  };
}

/* ---------- Rendering ---------- */
function render() {
  els.board.innerHTML = "";

  state.lists.forEach((list) => {
    const listEl = document.createElement("section");
    listEl.className = "list";
    listEl.dataset.listId = list.id;

    // Header
    const header = document.createElement("div");
    header.className = "list-header";

    const title = document.createElement("h3");
    title.className = "list-title";
    title.textContent = list.title;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.type = "button";
    renameBtn.title = "Rename list";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => renameList(list.id));

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.type = "button";
    delBtn.title = "Delete list";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteList(list.id));

    actions.append(renameBtn, delBtn);
    header.append(title, actions);

    // Cards container
    const cardsEl = document.createElement("div");
    cardsEl.className = "cards";
    cardsEl.dataset.listId = list.id;

    cardsEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      listEl.classList.add("drag-over");
    });
    cardsEl.addEventListener("dragleave", () => listEl.classList.remove("drag-over"));
    cardsEl.addEventListener("drop", (e) => {
      e.preventDefault();
      listEl.classList.remove("drag-over");
      const cardId = e.dataTransfer.getData("text/card-id");
      if (cardId) moveCardToList(cardId, list.id);
    });

    // Card elements
    list.cardIds.forEach((cardId) => {
      const card = state.cards[cardId];
      if (!card) return;

      const cardEl = document.createElement("article");
      cardEl.className = "card";
      cardEl.draggable = true;
      cardEl.dataset.cardId = card.id;

      cardEl.addEventListener("dragstart", (e) => {
        cardEl.classList.add("dragging");
        e.dataTransfer.setData("text/card-id", card.id);
      });
      cardEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));

      const top = document.createElement("div");
      top.className = "card-top";

      const cardTitle = document.createElement("p");
      cardTitle.className = "card-title";
      cardTitle.textContent = card.title;
      cardTitle.addEventListener("dblclick", () => editCard(card.id));

      const xBtn = document.createElement("button");
      xBtn.className = "icon-btn";
      xBtn.type = "button";
      xBtn.title = "Delete card";
      xBtn.textContent = "✕";
      xBtn.addEventListener("click", () => deleteCard(card.id));

      top.append(cardTitle, xBtn);

      const meta = document.createElement("div");
      meta.className = "card-meta";

      const cat = CATEGORY_OPTIONS.find((c) => c.key === card.category) ?? CATEGORY_OPTIONS[2];
      const badge = document.createElement("span");
      badge.className = `badge ${cat.key}`;
      badge.textContent = cat.label;

      const created = document.createElement("span");
      created.textContent = formatDateTime(card.createdAt);

      meta.append(badge, created);

      const dueTxt = formatDue(card.dueDate);
      if (dueTxt) {
        const due = document.createElement("span");
        due.className = "due";
        due.textContent = `Due: ${dueTxt}`;
        meta.append(due);
      }

      cardEl.append(top, meta);
      cardsEl.append(cardEl);
    });

    // Add card form (now includes category + due date)
    const addCard = document.createElement("form");
    addCard.className = "add-card";
    addCard.dataset.listId = list.id;

    const ta = document.createElement("textarea");
    ta.placeholder = "Add a card… (e.g. Finish MEN lab #3)";
    ta.maxLength = 160;

    const row = document.createElement("div");
    row.className = "row";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Category");
    CATEGORY_OPTIONS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.label;
      select.append(opt);
    });
    select.value = "project";

    const due = document.createElement("input");
    due.type = "date";
    due.setAttribute("aria-label", "Due date");

    row.append(select, due);

    const row2 = document.createElement("div");
    row2.className = "row2";

    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.type = "submit";
    addBtn.textContent = "Add Card";

    row2.append(addBtn);

    addCard.append(ta, row, row2);

    addCard.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;

      const category = select.value;
      const dueDate = due.value ? due.value : null;

      createCard(list.id, text, category, dueDate);
      ta.value = "";
      due.value = "";
      select.value = "project";
    });

    listEl.append(header, cardsEl, addCard);
    els.board.append(listEl);
  });
}

/* ---------- List actions ---------- */
function createList(title) {
  const newList = { id: uid("list"), title, cardIds: [] };
  state.lists.push(newList);
  saveStateV2();
  render();
  toast("List added");
}

function renameList(listId) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;

  const next = prompt("Rename list:", list.title);
  if (next === null) return;
  const cleaned = next.trim();
  if (!cleaned) return;

  list.title = cleaned;
  saveStateV2();
  render();
  toast("List renamed");
}

function deleteList(listId) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;

  const ok = confirm(`Delete list "${list.title}" and all its cards?`);
  if (!ok) return;

  list.cardIds.forEach((cid) => delete state.cards[cid]);
  state.lists = state.lists.filter((l) => l.id !== listId);

  saveStateV2();
  render();
  toast("List deleted");
}

/* ---------- Card actions ---------- */
function createCard(listId, title, category, dueDate) {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;

  const id = uid("card");
  state.cards[id] = {
    id,
    title,
    createdAt: nowISO(),
    category: category ?? "project",
    dueDate: dueDate ?? null,
  };
  list.cardIds.push(id);

  saveStateV2();
  render();
  toast("Card added");
}

function editCard(cardId) {
  const card = state.cards[cardId];
  if (!card) return;

  const nextTitle = prompt("Edit card title:", card.title);
  if (nextTitle === null) return;
  const cleaned = nextTitle.trim();
  if (!cleaned) return;

  // Optional quick edit prompts for category/due
  const catPrompt = prompt(
    `Category (assignment/lab/project/mod/unfinished):`,
    card.category ?? "project"
  );
  const cat = (catPrompt ?? "").trim().toLowerCase();
  const valid = CATEGORY_OPTIONS.some((c) => c.key === cat) ? cat : card.category;

  const duePrompt = prompt(`Due date (YYYY-MM-DD) or blank:`, card.dueDate ?? "");
  const dueClean = (duePrompt ?? "").trim();
  const dueDate = dueClean.length ? dueClean : null;

  card.title = cleaned;
  card.category = valid;
  card.dueDate = dueDate;

  saveStateV2();
  render();
  toast("Card updated");
}

function deleteCard(cardId) {
  const card = state.cards[cardId];
  if (!card) return;

  const ok = confirm(`Delete card "${card.title}"?`);
  if (!ok) return;

  state.lists.forEach((l) => {
    l.cardIds = l.cardIds.filter((id) => id !== cardId);
  });
  delete state.cards[cardId];

  saveStateV2();
  render();
  toast("Card deleted");
}

/* ---------- Drag & drop ---------- */
function moveCardToList(cardId, targetListId) {
  if (!state.cards[cardId]) return;

  const fromList = state.lists.find((l) => l.cardIds.includes(cardId));
  const toList = state.lists.find((l) => l.id === targetListId);
  if (!toList) return;

  if (fromList) fromList.cardIds = fromList.cardIds.filter((id) => id !== cardId);
  if (!toList.cardIds.includes(cardId)) toList.cardIds.push(cardId);

  saveStateV2();
  render();
  toast("Card moved");
}

/* ---------- Export / Import / Reset ---------- */
function exportBoard() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lumo-trello-board.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  toast("Exported JSON");
}

function importBoardFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const normalized = normalizeImportedState(parsed);
      state = normalized;
      saveStateV2();
      render();
      toast("Imported board");
    } catch (e) {
      console.error(e);
      toast("Import failed (invalid JSON)");
      alert("Import failed: invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

function normalizeImportedState(parsed) {
  // Accept either V2 or older-ish shapes, normalize to V2.
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");

  const lists = Array.isArray(parsed.lists) ? parsed.lists : [];
  const cards = parsed.cards && typeof parsed.cards === "object" ? parsed.cards : {};

  const out = {
    version: 2,
    lists: lists.map((l) => ({
      id: l.id ?? uid("list"),
      title: l.title ?? "Untitled",
      cardIds: Array.isArray(l.cardIds) ? l.cardIds.slice() : [],
    })),
    cards: {},
  };

  for (const [id, c] of Object.entries(cards)) {
    out.cards[id] = {
      id: c.id ?? id,
      title: c.title ?? "Untitled",
      createdAt: c.createdAt ?? nowISO(),
      category: CATEGORY_OPTIONS.some((x) => x.key === c.category) ? c.category : "project",
      dueDate: typeof c.dueDate === "string" ? c.dueDate : null,
    };
  }

  return out;
}

function resetBoard() {
  const ok = confirm("Reset board to starter data? This overwrites your saved board.");
  if (!ok) return;
  state = starterStateV2();
  saveStateV2();
  render();
  toast("Reset complete");
}

/* ---------- Wire up ---------- */
els.addListForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = els.listTitleInput.value.trim();
  if (!title) return;
  createList(title);
  els.listTitleInput.value = "";
  els.listTitleInput.focus();
});

els.resetBtn.addEventListener("click", resetBoard);
els.exportBtn.addEventListener("click", exportBoard);

els.importInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importBoardFromFile(file);
  e.target.value = ""; // allow re-importing same file
});

/* ---------- Initial render ---------- */
render();
toast("Loaded Lumo’s Trello");

console.log("Lumo’s Trello — Mod-Vault companion board");
//# sourceMappingURL=app.js.map