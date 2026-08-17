"use strict";

const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");

function input() {
  return {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
}

async function getAuthConfig(projectId) {
  return googleRequest(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    { quotaProjectId: projectId, allowStatuses: [404] },
  );
}

function listWebApps(projectId) {
  const result = parseFirebaseJson(runFirebase(["apps:list", "--project", projectId, "--json"]).stdout);
  return result.filter(app => String(app.platform || "").toUpperCase() === "WEB");
}

async function main() {
  const execute = process.argv.includes("--execute");
  const identity = execute
    ? requireMutationConfirmation(input())
    : requireExplicitProjectIdentity(input());
  console.log(environmentBanner(identity));

  const current = await getAuthConfig(identity.targetProjectId);
  const webApps = listWebApps(identity.targetProjectId);
  if (!execute) {
    console.log(JSON.stringify({
      result: "DRY_RUN",
      authInitialized: current.status === 200,
      anonymousSignInEnabled: current.body?.signIn?.anonymous?.enabled === true,
      existingWebAppCount: webApps.length,
      actions: [
        ...(current.status === 404 ? ["initialize staging Identity Platform"] : []),
        ...(!webApps.length ? ["create staging-only Firebase WEB app"] : []),
        ...(current.body?.signIn?.anonymous?.enabled !== true ? ["enable anonymous synthetic staging identities"] : []),
      ],
      productionMutationPerformed: false,
    }, null, 2));
    return;
  }

  if (current.status === 404) {
    await googleRequest(
      `https://identitytoolkit.googleapis.com/v2/projects/${identity.targetProjectId}/identityPlatform:initializeAuth`,
      { method: "POST", body: {}, quotaProjectId: identity.targetProjectId },
    );
  }

  let apps = listWebApps(identity.targetProjectId);
  if (!apps.length) {
    parseFirebaseJson(runFirebase([
      "apps:create", "WEB", "Crownlands Phase 9 Staging QA",
      "--project", identity.targetProjectId,
      "--json",
    ]).stdout);
    apps = listWebApps(identity.targetProjectId);
  }
  if (apps.length !== 1) throw new Error(`Expected exactly one staging WEB app; found ${apps.length}.`);

  await googleRequest(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${identity.targetProjectId}/config?updateMask=signIn.anonymous.enabled`,
    {
      method: "PATCH",
      body: { signIn: { anonymous: { enabled: true } } },
      quotaProjectId: identity.targetProjectId,
    },
  );
  const verified = await getAuthConfig(identity.targetProjectId);
  if (verified.status !== 200 || verified.body?.signIn?.anonymous?.enabled !== true) {
    throw new Error("Anonymous staging authentication did not verify as enabled.");
  }
  console.log(JSON.stringify({
    result: "PASS",
    environment: identity.environment,
    stagingProjectId: identity.targetProjectId,
    webAppId: apps[0].appId,
    webAppDisplayName: apps[0].displayName,
    identityPlatformInitialized: true,
    anonymousSyntheticIdentityProviderEnabled: true,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-auth-provision-error"}: ${error.message}`);
  process.exitCode = 1;
});
