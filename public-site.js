(function () {
  const body = document.body;
  body.classList.add("public-site-ready");

  const menuButton = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-site-menu]");
  if (menuButton && menu) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menu.toggleAttribute("data-open", !open);
    });
  }

  const progress = document.querySelector("[data-reading-progress]");
  if (progress) {
    const updateProgress = () => {
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      const percent = maximum > 0 ? Math.min(100, Math.max(0, (window.scrollY / maximum) * 100)) : 0;
      progress.style.setProperty("--reading-progress", `${percent}%`);
    };
    updateProgress();
    addEventListener("scroll", updateProgress, { passive: true });
    addEventListener("resize", updateProgress);
  }

  const filterInput = document.querySelector("[data-guide-search]");
  const filterButtons = [...document.querySelectorAll("[data-guide-filter]")];
  const guideCards = [...document.querySelectorAll("[data-guide-card]")];
  const resultCount = document.querySelector("[data-guide-count]");
  let activeFilter = "all";

  function filterGuides() {
    const query = String(filterInput?.value || "").trim().toLowerCase();
    let visible = 0;
    guideCards.forEach(card => {
      const category = String(card.dataset.category || "");
      const searchText = String(card.dataset.search || card.textContent || "").toLowerCase();
      const matchesCategory = activeFilter === "all" || category.split(" ").includes(activeFilter);
      const matchesQuery = !query || searchText.includes(query);
      const show = matchesCategory && matchesQuery;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (resultCount) resultCount.textContent = `${visible} guide${visible === 1 ? "" : "s"}`;
  }

  filterInput?.addEventListener("input", filterGuides);
  filterButtons.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.guideFilter || "all";
    filterButtons.forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
    filterGuides();
  }));
  if (guideCards.length) filterGuides();

  function formatPatchNoteDate(release) {
    const dateKey = String(release?.dateKey || "").trim();
    const hasUtcDateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
    const date = new Date(hasUtcDateKey ? `${dateKey}T00:00:00.000Z` : release?.publishedAt);
    if (Number.isNaN(date.getTime())) return "Recent update";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(hasUtcDateKey ? { timeZone: "UTC" } : {}),
    });
  }

  function normalizePatchNoteReleases() {
    const releases = Array.isArray(window.CROWNLANDS_PATCH_NOTES?.releases)
      ? window.CROWNLANDS_PATCH_NOTES.releases
      : [];
    return releases
      .map(release => ({
        buildId: String(release?.buildId || "").trim(),
        dateKey: String(release?.dateKey || "").trim(),
        publishedAt: String(release?.publishedAt || "").trim(),
        notes: (Array.isArray(release?.notes) ? release.notes : [])
          .map(note => String(note || "").trim())
          .filter(Boolean),
      }))
      .filter(release => release.notes.length)
      .slice(0, 6);
  }

  function createPatchNotePost(release, index) {
    const article = document.createElement("article");
    article.className = `update-post patch-note-post${index === 0 ? " is-current" : ""}`;
    article.dataset.updatePost = "patch-notes";

    const meta = document.createElement("div");
    meta.className = "patch-note-meta";
    const type = document.createElement("span");
    type.className = "update-type";
    type.textContent = index === 0 ? "Latest patch notes" : "Previous patch notes";
    const time = document.createElement("time");
    time.dateTime = release.dateKey || release.publishedAt;
    time.textContent = formatPatchNoteDate(release);
    meta.append(type, time);

    const heading = document.createElement("h2");
    heading.textContent = index === 0 ? "Current deployed changes" : "Earlier deployed changes";
    const list = document.createElement("ul");
    release.notes.forEach(note => {
      const item = document.createElement("li");
      item.textContent = note;
      list.append(item);
    });

    const footer = document.createElement("footer");
    footer.className = "patch-note-footer";
    const build = document.createElement("span");
    const shortBuildId = release.buildId.length > 12 ? release.buildId.slice(0, 12) : release.buildId || "dev";
    build.textContent = `Build ${shortBuildId}`;
    footer.append(build);
    if (index === 0) {
      const current = document.createElement("strong");
      current.textContent = "Current";
      footer.append(current);
    }

    article.append(meta, heading, list, footer);
    return article;
  }

  function renderPublicPatchNotes() {
    const feed = document.querySelector("[data-patch-notes-feed]");
    if (!feed) return;
    const releases = normalizePatchNoteReleases();
    if (!releases.length) {
      const loadingHeading = feed.querySelector("h2");
      const loadingCopy = feed.querySelector("p");
      if (loadingHeading) loadingHeading.textContent = "Patch notes temporarily unavailable";
      if (loadingCopy) loadingCopy.textContent = "Please try again shortly. The development articles below are still available.";
      return;
    }
    feed.replaceChildren(...releases.map(createPatchNotePost));
    const currentDate = formatPatchNoteDate(releases[0]);
    document.querySelectorAll("[data-patch-notes-updated]").forEach(element => {
      element.textContent = `Latest release ${currentDate}`;
    });
  }

  renderPublicPatchNotes();

  const planner = document.querySelector("[data-kingdom-planner]");
  if (planner) {
    const stage = planner.querySelector("[name='kingdom-stage']");
    const priority = planner.querySelector("[name='kingdom-priority']");
    const output = planner.querySelector("[data-planner-output]");
    const plans = {
      "new:economy": ["Secure two nearby neutral cities", "Upgrade the safest producer first", "Keep a reserve in the Main City", "/daily-rewards-guide.html"],
      "new:combat": ["Scout before every uncertain march", "Compare wall and garrison separately", "Avoid draining every city at once", "/battle-reports-guide.html"],
      "new:clan": ["Join an active clan", "Keep one city ready to reinforce", "Learn assignment and rally limits", "/clans-rallies-guide.html"],
      "growing:economy": ["Balance upgrades across safe cities", "Claim active-map production pickups", "Use missions as a daily plan", "/daily-rewards-guide.html"],
      "growing:combat": ["Build fresh ten-minute intelligence", "Launch only after checking capture power", "Time attacks around wall repair", "/scouting-guide.html"],
      "growing:clan": ["Coordinate objective windows", "Stage reinforcements before pressure arrives", "Use the War Room for combined attacks", "/clans-rallies-guide.html"],
      "established:economy": ["Protect high-value production centers", "Review skill presets before spending", "Convert daily objectives into long-term growth", "/skills-presets-guide.html"],
      "established:combat": ["Track live defense changes after launch", "Use reports to audit every multiplier", "Pressure damaged walls before full recovery", "/battle-reports-guide.html"],
      "established:clan": ["Assign roles for offense and defense", "Build rallies around travel time", "Contest Strongholds that fit the clan plan", "/objectives-guide.html"],
    };
    const updatePlan = () => {
      const plan = plans[`${stage.value}:${priority.value}`] || plans["new:economy"];
      output.innerHTML = `<strong>Your next three moves</strong><ol><li>${plan[0]}</li><li>${plan[1]}</li><li>${plan[2]}</li></ol><a href="${plan[3]}">Open the matching guide →</a>`;
    };
    stage.addEventListener("change", updatePlan);
    priority.addEventListener("change", updatePlan);
    updatePlan();
  }

  const updateFilter = document.querySelector("[data-update-filter]");
  if (updateFilter) {
    const posts = [...document.querySelectorAll("[data-update-post]")];
    updateFilter.addEventListener("change", () => {
      const selected = updateFilter.value;
      posts.forEach(post => { post.hidden = selected !== "all" && post.dataset.updatePost !== selected; });
    });
  }

  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    document.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
  }
})();
