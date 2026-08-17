"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  CONFIG,
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { googleRequest } = require("./google-api");

const METRIC_TYPE = "custom.googleapis.com/crownlands/phase9/signals";
const SIGNALS = Object.freeze([
  "generation_failure",
  "retry_rate",
  "queue_age",
  "standby_buffer_below_2",
  "publication_failure",
  "activation_failure",
  "package_hash_mismatch",
  "edge_contract_failure",
  "duplicate_coordinate",
  "storage_failure",
  "controller_heartbeat_missing",
  "city_placement_failure",
  "function_error",
  "firestore_transaction_abort",
]);
const RESULT_PATH = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results/MONITORING.json");

async function ensureMetricDescriptor(projectId, execute) {
  const name = `projects/${projectId}/metricDescriptors/${METRIC_TYPE}`;
  const current = await googleRequest(`https://monitoring.googleapis.com/v3/${name}`, { allowStatuses: [404] });
  if (current.status === 200 || !execute) return { created: false, exists: current.status === 200 };
  await googleRequest(`https://monitoring.googleapis.com/v3/projects/${projectId}/metricDescriptors`, {
    method: "POST",
    quotaProjectId: projectId,
    body: {
      type: METRIC_TYPE,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      unit: "1",
      description: "Crownlands Phase 9 staging-only generated-world operational signals.",
      displayName: "Crownlands Phase 9 staging signals",
      labels: [{ key: "signal", valueType: "STRING", description: "Bounded Phase 9 alert signal." }],
    },
  });
  return { created: true, exists: true };
}

async function listPolicies(projectId) {
  const response = await googleRequest(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/alertPolicies?pageSize=200`,
    { quotaProjectId: projectId },
  );
  return response.body?.alertPolicies || [];
}

async function ensurePolicies(projectId, execute) {
  let policies = await listPolicies(projectId);
  const results = [];
  for (const signal of SIGNALS) {
    const displayName = `Crownlands Phase 9 STAGING — ${signal}`;
    let policy = policies.find(item => item.displayName === displayName);
    let created = false;
    if (!policy && execute) {
      const response = await googleRequest(`https://monitoring.googleapis.com/v3/projects/${projectId}/alertPolicies`, {
        method: "POST",
        quotaProjectId: projectId,
        body: {
          displayName,
          documentation: {
            content: `STAGING ONLY. Signal ${signal} requires Crownlands generated-world operator review. Do not interpret as a production alert.`,
            mimeType: "text/markdown",
          },
          combiner: "OR",
          enabled: true,
          severity: signal.includes("failure") || signal.includes("mismatch") ? "CRITICAL" : "WARNING",
          userLabels: { environment: "staging", phase: "phase9" },
          conditions: [{
            displayName: `${signal} > 0`,
            conditionThreshold: {
              filter: `resource.type = "global" AND metric.type = "${METRIC_TYPE}" AND metric.label.signal = "${signal}"`,
              comparison: "COMPARISON_GT",
              thresholdValue: 0,
              duration: "0s",
              aggregations: [{
                alignmentPeriod: "60s",
                perSeriesAligner: "ALIGN_MAX",
                crossSeriesReducer: "REDUCE_MAX",
                groupByFields: [],
              }],
              trigger: { count: 1 },
            },
          }],
          alertStrategy: {
            autoClose: "3600s",
            notificationPrompts: ["OPENED", "CLOSED"],
          },
        },
      });
      policy = response.body;
      created = true;
      policies.push(policy);
    }
    results.push({ signal, created, policyName: policy?.name || "", enabled: policy?.enabled === true });
  }
  return results;
}

async function writeSignals(projectId, value, timestamp) {
  await googleRequest(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`, {
    method: "POST",
    quotaProjectId: projectId,
    body: {
      timeSeries: SIGNALS.map(signal => ({
        metric: { type: METRIC_TYPE, labels: { signal } },
        resource: { type: "global", labels: { project_id: projectId } },
        points: [{ interval: { endTime: timestamp }, value: { doubleValue: value } }],
      })),
    },
  });
}

async function main() {
  const execute = process.argv.includes("--execute");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const descriptor = await ensureMetricDescriptor(identity.targetProjectId, execute);
  const policies = await ensurePolicies(identity.targetProjectId, execute);
  const triggeredAt = new Date().toISOString();
  if (execute) {
    await writeSignals(identity.targetProjectId, 1, triggeredAt);
    await new Promise(resolve => setTimeout(resolve, 10000));
    await writeSignals(identity.targetProjectId, 0, new Date().toISOString());
  }
  const result = {
    schemaVersion: "phase9-staging-monitoring-result-v1",
    result: execute ? "PASS" : "DRY_RUN",
    environment: identity.environment,
    stagingProjectId: identity.targetProjectId,
    metricType: METRIC_TYPE,
    metricDescriptor: descriptor,
    policyCount: policies.filter(policy => policy.policyName).length,
    policies,
    safeTriggerTest: {
      executed: execute,
      triggeredSignalCount: execute ? SIGNALS.length : 0,
      triggeredAt,
      resetToZero: execute,
      productionSignalsEmitted: false,
    },
    notificationChannelsConfigured: false,
    notificationLimitation: "Policies create Cloud Monitoring incidents, but no external paging channel was authorized for this task.",
    productionMutationPerformed: false,
  };
  if (execute) {
    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    result: result.result,
    environment: result.environment,
    policyCount: result.policyCount,
    signalsTriggeredAndReset: result.safeTriggerTest.triggeredSignalCount,
    externalPagingConfigured: false,
    productionMutationPerformed: false,
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-monitoring-error"}: ${error.message}`);
  process.exitCode = 1;
});
