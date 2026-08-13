(function initializeCrownlandsRoadmap() {
  "use strict";

  const data = window.CROWNLANDS_ROADMAP;
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.phases)) return;

  const board = document.getElementById("roadmapBoard");
  const statusFilters = document.getElementById("statusFilters");
  const categoryFilters = document.getElementById("categoryFilters");
  const searchInput = document.getElementById("roadmapSearch");
  const resultsStatus = document.getElementById("roadmapResultsStatus");
  const clearFiltersButton = document.getElementById("clearRoadmapFilters");
  const emptyState = document.getElementById("roadmapEmpty");
  const liveRegionNodes = document.getElementById("liveRegionNodes");
  const futureRegionNodes = document.getElementById("futureRegionNodes");
  if (!board || !statusFilters || !categoryFilters || !searchInput || !resultsStatus || !emptyState) return;

  const state = {
    phase: "all",
    category: "all",
    query: "",
    expandedId: "",
  };

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function createFilterButton(label, value, group) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roadmap-filter";
    button.dataset[group] = value;
    button.textContent = label;
    button.setAttribute("aria-pressed", value === "all" ? "true" : "false");
    return button;
  }

  function renderFilterControls() {
    statusFilters.replaceChildren(
      createFilterButton("All", "all", "phaseFilter"),
      ...data.phases.map(phase => createFilterButton(phase.shortLabel, phase.id, "phaseFilter")),
    );
    categoryFilters.replaceChildren(
      createFilterButton("All categories", "all", "categoryFilter"),
      ...data.categories.map(category => createFilterButton(category, category, "categoryFilter")),
    );
  }

  function updateFilterStates() {
    statusFilters.querySelectorAll("[data-phase-filter]").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.phaseFilter === state.phase ? "true" : "false");
    });
    categoryFilters.querySelectorAll("[data-category-filter]").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.categoryFilter === state.category ? "true" : "false");
    });
    document.querySelectorAll("[data-phase-shortcut]").forEach(button => {
      const selected = button.dataset.phaseShortcut === state.phase;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function itemMatches(item) {
    if (state.phase !== "all" && item.phase !== state.phase) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (!state.query) return true;
    const searchable = normalize([
      item.title,
      item.status,
      item.category,
      item.shortDescription,
      item.longDescription,
    ].join(" "));
    return searchable.includes(state.query);
  }

  function closeExpandedCard() {
    if (!state.expandedId) return;
    const openCard = board.querySelector(`[data-roadmap-id="${CSS.escape(state.expandedId)}"]`);
    openCard?.classList.remove("expanded");
    const openButton = openCard?.querySelector(".roadmap-card-toggle");
    const openDetail = openCard?.querySelector(".roadmap-card-detail");
    openButton?.setAttribute("aria-expanded", "false");
    if (openDetail) openDetail.hidden = true;
    state.expandedId = "";
  }

  function toggleCard(card, button, detail, itemId) {
    const willOpen = state.expandedId !== itemId;
    closeExpandedCard();
    if (!willOpen) return;
    state.expandedId = itemId;
    card.classList.add("expanded");
    button.setAttribute("aria-expanded", "true");
    detail.hidden = false;
  }

  function createRoadmapCard(item) {
    const card = document.createElement("article");
    card.className = `roadmap-card status-${slug(item.status)}`;
    card.dataset.roadmapId = item.id;
    card.dataset.category = item.category;

    const detailId = `roadmap-detail-${item.id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roadmap-card-toggle";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", detailId);

    const top = document.createElement("span");
    top.className = "roadmap-card-top";

    const icon = document.createElement("span");
    icon.className = "roadmap-card-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = item.icon;

    const badge = document.createElement("span");
    badge.className = "roadmap-status-badge";
    badge.textContent = item.status;

    const title = document.createElement("strong");
    title.className = "roadmap-card-title";
    title.textContent = item.title;

    const summary = document.createElement("span");
    summary.className = "roadmap-card-summary";
    summary.textContent = item.shortDescription;

    const footer = document.createElement("span");
    footer.className = "roadmap-card-footer";

    const category = document.createElement("span");
    category.textContent = item.category;

    const action = document.createElement("span");
    action.className = "roadmap-card-action";
    action.innerHTML = `Read decree <span aria-hidden="true">+</span>`;

    top.append(icon, badge);
    footer.append(category, action);
    button.append(top, title, summary, footer);

    const detail = document.createElement("div");
    detail.id = detailId;
    detail.className = "roadmap-card-detail";
    detail.hidden = true;
    const detailText = document.createElement("p");
    detailText.textContent = item.longDescription;
    detail.append(detailText);

    button.addEventListener("click", () => toggleCard(card, button, detail, item.id));
    card.append(button, detail);
    return card;
  }

  function createPhaseColumn(phase, items) {
    const column = document.createElement("section");
    column.className = `roadmap-phase phase-${phase.id}`;
    column.setAttribute("aria-labelledby", `phase-title-${phase.id}`);

    const header = document.createElement("header");
    header.className = "roadmap-phase-header";

    const count = document.createElement("span");
    count.className = "roadmap-phase-count";
    count.textContent = String(items.length);
    count.setAttribute("aria-label", `${items.length} roadmap items`);

    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = phase.id === "playable" ? "Raised banners" : phase.id === "improving" ? "At the forge" : phase.id === "development" ? "Under construction" : "Beyond the horizon";
    const title = document.createElement("h2");
    title.id = `phase-title-${phase.id}`;
    title.textContent = phase.label;
    const description = document.createElement("p");
    description.textContent = phase.description;
    copy.append(eyebrow, title, description);
    header.append(copy, count);

    const list = document.createElement("div");
    list.className = "roadmap-card-list";
    items.forEach(item => list.append(createRoadmapCard(item)));
    column.append(header, list);
    return column;
  }

  function renderBoard() {
    state.expandedId = "";
    const matchedItems = data.items.filter(itemMatches).sort((left, right) => left.sortOrder - right.sortOrder);
    const fragment = document.createDocumentFragment();
    data.phases.forEach(phase => {
      const phaseItems = matchedItems.filter(item => item.phase === phase.id);
      if (phaseItems.length) fragment.append(createPhaseColumn(phase, phaseItems));
    });
    board.replaceChildren(fragment);
    board.hidden = matchedItems.length === 0;
    emptyState.hidden = matchedItems.length > 0;
    const suffix = matchedItems.length === 1 ? "decree" : "decrees";
    resultsStatus.textContent = `${matchedItems.length} ${suffix} shown`;
    clearFiltersButton.hidden = state.phase === "all" && state.category === "all" && !state.query;
    updateFilterStates();
  }

  function setPhase(phase) {
    state.phase = data.phases.some(entry => entry.id === phase) ? phase : "all";
    renderBoard();
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById("roadmapBoard")?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  }

  function clearFilters() {
    state.phase = "all";
    state.category = "all";
    state.query = "";
    searchInput.value = "";
    renderBoard();
  }

  function renderRealmNodes() {
    if (liveRegionNodes) {
      liveRegionNodes.replaceChildren(...Array.from({ length: 15 }, (_, index) => {
        const node = document.createElement("span");
        node.className = "region-node live";
        node.style.setProperty("--node-index", String(index));
        node.textContent = String(index + 1);
        return node;
      }));
    }
    if (futureRegionNodes) {
      futureRegionNodes.replaceChildren(...Array.from({ length: 6 }, (_, index) => {
        const node = document.createElement("span");
        node.className = "region-node future";
        node.style.setProperty("--node-index", String(index + 15));
        node.textContent = "?";
        return node;
      }));
    }
  }

  renderFilterControls();
  renderRealmNodes();
  renderBoard();

  statusFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-phase-filter]");
    if (!button) return;
    state.phase = button.dataset.phaseFilter || "all";
    renderBoard();
  });

  categoryFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-category-filter]");
    if (!button) return;
    state.category = button.dataset.categoryFilter || "all";
    renderBoard();
  });

  searchInput.addEventListener("input", () => {
    state.query = normalize(searchInput.value);
    renderBoard();
  });

  clearFiltersButton.addEventListener("click", clearFilters);
  document.querySelector("[data-clear-roadmap]")?.addEventListener("click", clearFilters);
  document.querySelectorAll("[data-phase-shortcut]").forEach(button => {
    button.addEventListener("click", () => setPhase(button.dataset.phaseShortcut));
  });
})();
