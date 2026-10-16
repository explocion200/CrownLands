"use strict";
const assert = require("node:assert/strict");
const { verifyImportedPassword, createLocalPassword, verifyLocalPassword } = require("../local-backend/passwords");

// Public synthetic known-answer fixture published by Firebase, never player data:
// https://github.com/firebase/scrypt#password-hashing
const config = { algorithm: "SCRYPT", signerKey: "jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==",
  saltSeparator: "Bw==", rounds: 8, memoryCost: 14 };
const user = { salt: "42xEC+ixf3L2lw==", passwordHash: "lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==" };

(async () => {
  assert.equal(await verifyImportedPassword("user1password", user, config), true);
  const urlBase64 = value => Buffer.from(value, "base64").toString("base64url");
  assert.equal(await verifyImportedPassword("user1password", { salt: urlBase64(user.salt), passwordHash: urlBase64(user.passwordHash) },
    { ...config, signerKey: urlBase64(config.signerKey), saltSeparator: urlBase64(config.saltSeparator) }), true);
  await assert.rejects(verifyImportedPassword("user1password", { ...user, salt: "invalid!" }, config));
  assert.equal(await verifyImportedPassword("wrong-password", user, config), false);
  assert.equal(await verifyImportedPassword("user1password", { ...user, disabled: true }, config), false);
  assert.equal(await verifyImportedPassword("user1password", {}, config), false);
  await assert.rejects(verifyImportedPassword("user1password", user, { ...config, memoryCost: 30 }));
  await assert.rejects(verifyImportedPassword("x".repeat(1025), user, config));
  const password = "  Synthetic-Ünicode-🔑-password  ";
  const record = await createLocalPassword(password);
  assert.equal(await verifyLocalPassword(password, record), true);
  assert.equal(await verifyLocalPassword(password.trim(), record), false);
  assert.equal(await verifyLocalPassword(password, { ...record, N: 2 ** 30 }), false);
  assert.notEqual((await createLocalPassword(password)).salt, record.salt);
  console.log("Local password compatibility: known Firebase vector, wrong/disabled rejection, parameter bounds and local hash verification passed.");
})().catch(() => { console.error("Local password compatibility checks failed."); process.exitCode = 1; });
