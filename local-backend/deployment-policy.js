"use strict";
const fs = require("node:fs");
const policies = new WeakSet();
const COMPONENTS = ["auth", "game", "worker", "mail", "push", "payments"];
const GAME = "migration_game_live", AUTH = "migration_auth_live";
function unavailable() { return Object.assign(Error("Crownlands is undergoing maintenance."), { code: "unavailable" }); }
function validateControl(value) {
  if (!value || Object.keys(value).sort().join() !== "epoch,phase,version" || value.version !== 1
    || !["standby", "active", "maintenance"].includes(value.phase) || !/^[a-f0-9]{32}$/.test(value.epoch || "")) throw unavailable();
  return Object.freeze({ ...value });
}
function readControl(file = "/etc/crownlands-runtime/activation.json") {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || stat.mode & 0o022 || stat.size > 1024) throw unavailable();
    return validateControl(JSON.parse(fs.readFileSync(fd, "utf8")));
  } finally { fs.closeSync(fd); }
}
// This capability is constructed only by the explicit permanent runtime. Preview
// constructors continue to require an owner and expiry; a boolean cannot opt out.
function createPolicy({ store, epoch, read = readControl }) {
  if (!store || !/^migration_(?:game|auth)_[a-z0-9_]{1,30}$/.test(store.schema)
    || !/^[a-f0-9]{32}$/.test(epoch || "") || typeof read !== "function") throw unavailable();
  const policy = {
    schema: store.schema,
    isActive() { try { const c = validateControl(read()); return c.phase === "active" && c.epoch === epoch; } catch { return false; } },
    async assertActive(client = store.pool) {
      if (!policy.isActive()) throw unavailable();
      const result = await client.query("SELECT crownlands_control.assert_active($1)", [epoch]);
      if (result.rowCount !== 1 || !policy.isActive()) throw unavailable();
    },
  };
  policies.add(policy); return Object.freeze(policy);
}
function isPolicy(value, schema) { return policies.has(value) && value.schema === schema; }
function privateJson(file, maximum = 65536) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    // systemd credentials are root-owned 0440 inside the unit's 0550 ACL directory.
    const managed = process.env.CREDENTIALS_DIRECTORY && file.startsWith(process.env.CREDENTIALS_DIRECTORY + "/")
      && /^\/run\/credentials\/crownlands-(?:auth|game|worker|mail|push|payments|payment-ingress)\.service$/.test(process.env.CREDENTIALS_DIRECTORY)
      && stat.uid === 0 && (stat.mode & 0o777) === 0o440
      && fs.realpathSync(file) === file && fs.statSync(process.env.CREDENTIALS_DIRECTORY).uid === 0
      && (fs.statSync(process.env.CREDENTIALS_DIRECTORY).mode & 0o777) === 0o550;
    if (!stat.isFile() || (stat.mode & 0o077 && !managed) || stat.size > maximum) throw unavailable();
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } finally { fs.closeSync(fd); }
}
module.exports = { COMPONENTS, GAME, AUTH, validateControl, readControl, createPolicy, isPolicy, privateJson, unavailable };
