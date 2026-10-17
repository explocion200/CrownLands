"use strict";
// Protected local operator commands. Evidence never goes to ordinary terminal logs.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const S = require("../functions/social");
async function operate(db, { action, reportId, reason, hours, epoch, operator = "local-operator", output }) {
  if (action === "list") {
    const reports = await db.collection("socialReports").where("status", "==", "open").orderBy("createdAtMs").limit(50).get();
    return { reports: reports.docs.map(doc => ({ id: doc.id, reason: doc.data().reason, createdAtMs: doc.data().createdAtMs })), limitedTo: 50 };
  }
  if (!/^[a-f0-9]{40}$/.test(reportId || "")) throw Error("Exact report ID required");
  if (action === "review") {
    if (!path.isAbsolute(output || "")) throw Error("Absolute private evidence output file required");
    const report = await db.doc("socialReports/" + reportId).get();
    if (!report.exists || report.data().expiresAtMs <= Date.now()) throw Error("Report unavailable");
    const fd = fs.openSync(output, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(report.data(), null, 2) + "\n"); } finally { fs.closeSync(fd); }
    return { savedPrivateEvidence: output };
  }
  if (!["dismiss", "restrict"].includes(action) || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500) throw Error("Action and explanatory reason required");
  if (action === "restrict" && (!Number.isInteger(hours) || hours < 0 || hours > 720)) throw Error("Restriction hours must be 0–720; 0 removes a restriction");
  const time = Date.now(), auditId = crypto.randomUUID();
  return db.runTransaction(async tx => {
    const ref = db.doc("socialReports/" + reportId), report = await tx.get(ref);
    if (!report.exists || report.data().expiresAtMs <= time) throw Error("Report unavailable");
    const evidence = report.data();
    if (action === "restrict") tx.set(db.doc(S.accountPath(evidence.reportedUid)), { restrictedUntilMs: time + hours * 3600000 }, { merge: true });
    tx.set(ref, { status: action === "dismiss" ? "dismissed" : "reviewed", reviewedAtMs: time, reviewReason: reason }, { merge: true });
    tx.set(db.doc("socialOperatorAudit/" + auditId), { action, reportId, reason, operator, epoch, createdAtMs: time, ...(action === "restrict" ? { hours } : {}) });
    return { applied: action, reportId, auditId };
  });
}
async function main(args) {
  const [action, reportId, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) { if (!["--reason", "--hours", "--output"].includes(rest[i]) || rest[i + 1] === undefined) throw Error("Unknown option"); options[rest[i].slice(2)] = rest[i + 1]; }
  const control = JSON.parse(fs.readFileSync("/etc/crownlands-runtime/activation.json", "utf8"));
  if (control.phase !== "active" || !/^[a-f0-9]{32}$/.test(control.epoch || "")) throw Error("Active local server required");
  const db = new Store({ schema: "migration_game_live" });
  try {
    const result = await db.pool.query("SELECT current_user AS name");
    if (result.rows[0].name !== "postgres") throw Error("Protected PostgreSQL operator identity required");
    console.log(JSON.stringify(await operate(db, { action, reportId, ...options, hours: Number(options.hours), epoch: control.epoch }), null, 2));
  } finally { await db.pool.end(); }
}
module.exports = { operate };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error("Social operator action stopped. Verify command, operator access and report ID; private details suppressed."); process.exitCode = 1; });
