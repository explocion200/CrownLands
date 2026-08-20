(function () {
  const patchNotes = {
  "buildId": "47b2e81d1137",
  "generatedAt": "2026-08-19T19:57:23.499Z",
  "releases": [
    {
      "buildId": "47b2e81d1137",
      "dateKey": "2026-08-19",
      "publishedAt": "2026-08-19T13:18:37-04:00",
      "notes": [
        "Add final art for north and northeast Core maps.",
        "Add final art for Crownlands east Core."
      ]
    },
    {
      "buildId": "d42f8590054b",
      "dateKey": "2026-08-17",
      "publishedAt": "2026-08-17T19:16:20-04:00",
      "notes": [
        "Validate generated-world architecture in Firebase staging.",
        "Define and validate Crownlands Core v2 vertical slice.",
        "Add Core v2 west and northwest map batch.",
        "Lock final Crownlands Core v2 art direction.",
        "Lock final Crownlands Core map art standard.",
        "Complete final art for first ten Core v2 maps."
      ]
    },
    {
      "buildId": "dac3ef0d3758",
      "dateKey": "2026-08-16",
      "publishedAt": "2026-08-16T16:34:55-04:00",
      "notes": [
        "Decouple generated road geometry from regional themes.",
        "Add generated-world publication and expansion architecture.",
        "Add generated-world production hardening and rollout rehearsal."
      ]
    },
    {
      "buildId": "696eec4d44c0",
      "dateKey": "2026-08-15",
      "publishedAt": "2026-08-14T23:08:37-04:00",
      "notes": [
        "Expand Crownlands map variation and validate 1000-region scale."
      ]
    },
    {
      "buildId": "68824a8c9c6e",
      "dateKey": "2026-08-14",
      "publishedAt": "2026-08-14T16:58:25-04:00",
      "notes": [
        "Add scalable Crownlands region catalog and player layer architecture.",
        "Add deterministic outer-layer and NPC city generation prototype.",
        "Enforce 40-city player regions and 15-NPC spawn threshold.",
        "Add deterministic Crownlands map composition pipeline.",
        "Build reusable directional Crownlands map art library.",
        "Validate Crownlands map variety across 1000 generated regions."
      ]
    },
    {
      "buildId": "899561cfc7ec",
      "dateKey": "2026-08-13",
      "publishedAt": "2026-08-13T19:05:41-04:00",
      "notes": [
        "Polish medieval interface artwork and interaction feedback.",
        "Release editor layout and interface polish.",
        "Release pending UI and website updates.",
        "Add interactive public roadmap.",
        "Optimize Crownlands map rendering performance.",
        "Polish Crownlands interface and map interactions."
      ]
    }
  ]
};
  patchNotes.releases.forEach(release => {
    release.notes = Object.freeze(release.notes);
    Object.freeze(release);
  });
  patchNotes.releases = Object.freeze(patchNotes.releases);
  window.CROWNLANDS_PATCH_NOTES = Object.freeze(patchNotes);
})();
