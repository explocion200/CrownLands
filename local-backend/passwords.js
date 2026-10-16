"use strict";
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);

function bytes(value, maximum = 256) {
  // Identity Toolkit exports use URL-safe Base64, while Firebase CLI/public
  // fixtures use standard Base64. Both represent the same original bytes.
  if (typeof value !== "string" || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(value)) throw Error("Invalid password parameters");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length > maximum || decoded.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) throw Error("Invalid password parameters");
  return decoded;
}

function passwordBytes(password) {
  if (typeof password !== "string" || !password.length || Buffer.byteLength(password) > 1024) throw Error("Invalid password input");
  // Preserve exactly the password bytes Firebase used; do not trim or normalize.
  return Buffer.from(password, "utf8");
}

async function firebaseHash(password, salt, config) {
  if (config?.algorithm !== "SCRYPT" || !Number.isInteger(config.memoryCost)
      || config.memoryCost < 1 || config.memoryCost > 17 || !Number.isInteger(config.rounds)
      || config.rounds < 1 || config.rounds > 16 || 128 * 2 ** config.memoryCost * config.rounds > 128 * 1024 ** 2) {
    throw Error("Unsupported imported password parameters");
  }
  const signerKey = bytes(config.signerKey);
  if (!signerKey.length) throw Error("Missing imported password signing key");
  const saltBytes = Buffer.concat([bytes(salt), bytes(config.saltSeparator)]);
  const passwordBuffer = passwordBytes(password);
  let derived;
  try {
    derived = await scrypt(passwordBuffer, saltBytes, 64,
      { N: 2 ** config.memoryCost, r: config.rounds, p: 1, maxmem: 160 * 1024 ** 2 });
    // Firebase's published modified-scrypt implementation encrypts the signer key
    // with AES-256-CTR, a zero counter and the first 32 derived bytes.
    // Reference: https://github.com/firebase/scrypt/blob/master/lib/scryptenc/scryptenc.c
    const cipher = crypto.createCipheriv("aes-256-ctr", derived.subarray(0, 32), Buffer.alloc(16));
    return Buffer.concat([cipher.update(signerKey), cipher.final()]);
  } finally {
    passwordBuffer.fill(0);
    signerKey.fill(0);
    if (derived) derived.fill(0);
  }
}

async function verifyImportedPassword(password, user, config) {
  if (user?.disabled || !user?.passwordHash || !user?.salt) return false;
  const expected = bytes(user.passwordHash);
  const actual = await firebaseHash(password, user.salt, config);
  try {
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } finally {
    expected.fill(0);
    actual.fill(0);
  }
}

async function createLocalPassword(password) {
  const input = passwordBytes(password);
  const salt = crypto.randomBytes(32);
  try {
    const hash = await scrypt(input, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 ** 2 });
    const record = { version: 1, algorithm: "scrypt", N: 32768, r: 8, p: 1,
      salt: salt.toString("base64"), hash: hash.toString("base64") };
    hash.fill(0);
    return record;
  } finally { input.fill(0); }
}

async function verifyLocalPassword(password, record) {
  if (record?.version !== 1 || record.algorithm !== "scrypt" || record.N !== 32768 || record.r !== 8 || record.p !== 1) return false;
  const input = passwordBytes(password), salt = bytes(record.salt), expected = bytes(record.hash);
  if (salt.length !== 32 || expected.length !== 64) { input.fill(0); return false; }
  let actual;
  try {
    actual = await scrypt(input, salt, 64, { N: record.N, r: record.r, p: record.p, maxmem: 64 * 1024 ** 2 });
    return crypto.timingSafeEqual(actual, expected);
  } finally {
    input.fill(0); expected.fill(0);
    if (actual) actual.fill(0);
  }
}

module.exports = { firebaseHash, verifyImportedPassword, createLocalPassword, verifyLocalPassword };
