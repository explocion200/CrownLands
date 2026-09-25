"use strict";

// Gameplay fixtures represent players who have completed email verification.
// Authentication tests use ordinary signup explicitly for unverified players.
async function signUpVerifiedPlayer(url, options) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const target = new URL(url);
  if (!host || target.host !== host || target.protocol !== "http:"
      || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
      || !target.pathname.endsWith("/accounts:signUp")) {
    throw new Error("Verified player fixtures require the local Auth emulator.");
  }
  const signup = await fetch(url, options);
  if (!signup.ok) return signup;
  const created = await signup.json();
  const root = `${target.origin}/identitytoolkit.googleapis.com/v1`;
  const verified = await fetch(`${root}/accounts:update?key=fake`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ localId: created.localId, emailVerified: true }),
  });
  if (!verified.ok) throw new Error(`Fixture verification failed (${verified.status}).`);
  const credentials = JSON.parse(options.body);
  const login = await fetch(`${root}/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: credentials.email, password: credentials.password, returnSecureToken: true }),
  });
  if (!login.ok) throw new Error(`Verified fixture login failed (${login.status}).`);
  const fresh = await login.json();
  if (fresh.localId !== created.localId) throw new Error("Verified fixture changed UID.");
  const claims = JSON.parse(Buffer.from(fresh.idToken.split(".")[1], "base64url").toString());
  if (claims.email_verified !== true) throw new Error("Fixture token is not verified.");
  return new Response(JSON.stringify({ ...created, ...fresh }), { status: signup.status, headers: { "content-type": "application/json" } });
}

module.exports = { signUpVerifiedPlayer };
