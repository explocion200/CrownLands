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
