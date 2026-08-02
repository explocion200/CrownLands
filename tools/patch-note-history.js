const MAX_PATCH_NOTE_RELEASES = 6;

function getUtcDateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function getUniqueNotes(commits, getNotes) {
  const notes = [];
  const seenNotes = new Set();
  commits.slice().reverse().forEach(({ commit }) => {
    const commitNotes = getNotes(commit);
    (Array.isArray(commitNotes) ? commitNotes : []).forEach(value => {
      const note = String(value || "").trim();
      if (!note || seenNotes.has(note)) return;
      seenNotes.add(note);
      notes.push(note);
    });
  });
  return notes;
}

function createDailyPatchNoteReleases(rows, options = {}) {
  const currentBuildId = String(options.currentBuildId || "").trim();
  const getNotes = typeof options.getNotes === "function" ? options.getNotes : () => [];
  const maxReleases = Math.max(1, Math.floor(Number(options.maxReleases) || MAX_PATCH_NOTE_RELEASES));
  const groups = [];
  const groupsByDate = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const commit = String(row?.commit || "").trim();
    const publishedAt = String(row?.publishedAt || "").trim();
    const dateKey = getUtcDateKey(publishedAt);
    if (!commit || !dateKey) return;

    let group = groupsByDate.get(dateKey);
    if (!group) {
      if (groups.length >= maxReleases) return;
      group = { dateKey, commits: [] };
      groupsByDate.set(dateKey, group);
      groups.push(group);
    }
    group.commits.push({ commit, publishedAt });
  });

  return groups.map((group, index) => {
    const newestCommit = group.commits[0];
    return {
      buildId: index === 0 ? currentBuildId : newestCommit.commit.slice(0, 12),
      dateKey: group.dateKey,
      publishedAt: newestCommit.publishedAt,
      notes: getUniqueNotes(group.commits, getNotes),
    };
  });
}

module.exports = {
  MAX_PATCH_NOTE_RELEASES,
  createDailyPatchNoteReleases,
  getUtcDateKey,
};
