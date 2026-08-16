"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { AGENT_PROFILES } = require("./constants");
const { redactSecrets } = require("./redact");

const ALLOWED_ENV_KEYS = Object.freeze([
  "APPDATA", "CODEX_HOME", "COMSPEC", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG", "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS", "OS", "PATHEXT", "PATH", "Path", "PROCESSOR_ARCHITECTURE", "PROGRAMDATA",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR",
]);

function sanitizedEnvironment(source = process.env) {
  const result = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  result.CROWNLANDS_STUDIO_AI = "1";
  return result;
}

function isModelUnavailable(error) {
  return /\bmodel\b.{0,80}\b(unavailable|not found|unsupported|not enabled|access|does not exist)\b/i.test(String(error?.message || error));
}

function resolvePackagedCodexPath(options = {}) {
  const resourcesPath = options.resourcesPath || process.resourcesPath || "";
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (!resourcesPath || (!options.resourcesPath && !String(__dirname).includes("app.asar"))) return "";
  const triples = {
    "win32-x64": "x86_64-pc-windows-msvc",
    "win32-arm64": "aarch64-pc-windows-msvc",
    "darwin-x64": "x86_64-apple-darwin",
    "darwin-arm64": "aarch64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-musl",
    "linux-arm64": "aarch64-unknown-linux-musl",
  };
  const target = `${platform}-${arch}`;
  const triple = triples[target];
  if (!triple) return "";
  return path.join(
    resourcesPath,
    "codex-runtime",
    "vendor",
    triple,
    "bin",
    platform === "win32" ? "codex.exe" : "codex",
  );
}

function safeEvent(event) {
  if (event.type === "thread.started") return { type: event.type, threadId: event.thread_id };
  if (event.type === "turn.completed") return { type: event.type, usage: event.usage };
  if (event.type === "turn.failed" || event.type === "error") return { type: event.type, error: redactSecrets(event.error?.message || event.message || "Codex turn failed.") };
  if (event.type !== "item.completed") return null;
  const item = event.item || {};
  if (item.type === "agent_message") return { type: "agent-message", text: redactSecrets(item.text, 24000) };
  if (item.type === "command_execution") return { type: "command", command: redactSecrets(item.command, 2000), output: redactSecrets(item.aggregated_output, 12000), exitCode: item.exit_code ?? null, status: item.status };
  if (item.type === "file_change") return { type: "file-change", changes: (item.changes || []).slice(0, 100).map(change => ({ path: String(change.path || "").replace(/\\/g, "/"), kind: change.kind })), status: item.status };
  if (item.type === "error") return { type: "error", error: redactSecrets(item.message || "Codex item failed.") };
  if (item.type === "todo_list") return { type: "todo", items: (item.items || []).slice(0, 30).map(todo => ({ text: redactSecrets(todo.text, 500), completed: Boolean(todo.completed) })) };
  return null;
}

function buildAgentPrompt(task, options = {}) {
  const profile = AGENT_PROFILES[task.route.agentId] || AGENT_PROFILES["feature-builder"];
  const permissionRules = task.permission === "review-only"
    ? "Inspect and report only. Do not edit, add, remove, rename, stage, or commit project files."
    : task.permission === "safe-edit"
      ? "Make focused changes only inside this isolated task worktree. Run relevant non-destructive tests. Do not merge, push, deploy, or access production services."
      : "You may make the larger in-scope development changes required inside this isolated task worktree and run local builds/validators. Still do not merge, push, deploy, mutate production, or perform destructive database operations.";
  const retry = options.retryContext ? `\nPrevious attempt context (continue from this worktree; do not restart blindly):\n${redactSecrets(options.retryContext, 20000)}\n` : "";
  return redactSecrets(`You are the Crownlands ${profile.label}. ${profile.purpose}

Task: ${task.prompt}

Permission: ${task.permission}
${permissionRules}

Approved plan:
${JSON.stringify(task.plan, null, 2)}

Attached Studio context:
${JSON.stringify(task.context || {}, null, 2)}
${retry}
Safety and delivery rules:
- Read and follow repository AGENTS.md instructions before acting.
- Mobile landscape browser behavior is primary; desktop remains supported.
- Preserve gameplay unless this task explicitly requires a gameplay change.
- Reuse existing Crownlands systems and components; do not create duplicate state systems.
- Work only inside the provided Git worktree. Do not use additional writable directories.
- Network access is disabled. Never print, inspect, or expose credentials, secrets, .env contents, Firebase keys, or tokens.
- Never merge, push, deploy, change DNS/hosting, mutate production Firebase/database state, or modify production secrets.
- Do not commit; the Studio review/apply workflow owns integration.
- Run the relevant focused tests/validators and report actual results. Do not invent passes.
- If protected credentials or production access are required, stop and explain what user action is needed.
- Finish with a concise summary of changes, files, tests, failures, and remaining risks.`, 48000);
}

class CodexRunner {
  constructor(options = {}) {
    this.CodexClass = options.CodexClass || null;
    this.codexPathOverride = options.codexPathOverride || resolvePackagedCodexPath(options.packagedRuntime);
    this.environment = { ...(options.environment || sanitizedEnvironment()) };
    if (this.codexPathOverride) {
      const runtimeTools = path.join(path.dirname(path.dirname(this.codexPathOverride)), "codex-path");
      const pathKey = Object.keys(this.environment).find(key => key.toLowerCase() === "path") || (process.platform === "win32" ? "Path" : "PATH");
      this.environment[pathKey] = [runtimeTools, this.environment[pathKey]].filter(Boolean).join(path.delimiter);
    }
  }

  async loadCodex() {
    if (this.CodexClass) return this.CodexClass;
    const module = await import("@openai/codex-sdk");
    this.CodexClass = module.Codex;
    return this.CodexClass;
  }

  async capabilities() {
    try {
      const Codex = await this.loadCodex();
      if (this.codexPathOverride) {
        await fsp.access(this.codexPathOverride);
        if (process.platform === "win32") await fsp.access(path.join(path.dirname(path.dirname(this.codexPathOverride)), "codex-resources", "codex-windows-sandbox-setup.exe"));
      }
      new Codex({ env: this.environment, codexPathOverride: this.codexPathOverride || undefined });
      const sdkVersion = require("../package.json").dependencies?.["@openai/codex-sdk"] || "installed";
      return { available: true, provider: "local-codex-sdk", sdkVersion, authentication: "checked-on-run", network: "disabled-for-task-sandbox" };
    } catch (error) {
      return { available: false, provider: "local-codex-sdk", error: redactSecrets(error.message || error) };
    }
  }

  async run(task, options) {
    const Codex = await this.loadCodex();
    const codex = new Codex({
      env: this.environment,
      codexPathOverride: this.codexPathOverride || undefined,
      config: { sandbox_workspace_write: { network_access: false }, web_search: "disabled" },
    });
    const threadOptions = {
      model: options.model || undefined,
      sandboxMode: task.permission === "review-only" ? "read-only" : "workspace-write",
      workingDirectory: options.workingDirectory,
      skipGitRepoCheck: false,
      modelReasoningEffort: options.reasoningEffort,
      networkAccessEnabled: false,
      webSearchMode: "disabled",
      approvalPolicy: "never",
    };
    const thread = options.threadId ? codex.resumeThread(options.threadId, threadOptions) : codex.startThread(threadOptions);
    const inputs = [{ type: "text", text: buildAgentPrompt(task, { retryContext: options.retryContext }) }];
    for (const imagePath of options.images || []) {
      const stat = await fsp.stat(imagePath).catch(() => null);
      if (stat?.isFile() && [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(imagePath).toLowerCase())) inputs.push({ type: "local_image", path: imagePath });
    }
    const streamed = await thread.runStreamed(inputs, { signal: options.signal });
    let finalResponse = "";
    let usage = null;
    let threadId = options.threadId || "";
    const commands = [];
    for await (const event of streamed.events) {
      const safe = safeEvent(event);
      if (!safe) continue;
      if (safe.type === "thread.started") threadId = safe.threadId;
      if (safe.type === "turn.completed") usage = safe.usage;
      if (safe.type === "agent-message") finalResponse = safe.text;
      if (safe.type === "command") commands.push(safe);
      await options.onEvent?.(safe);
      if (safe.type === "error") throw new Error(safe.error);
    }
    return { finalResponse, usage, threadId: thread.id || threadId, commands };
  }
}

module.exports = { CodexRunner, buildAgentPrompt, isModelUnavailable, resolvePackagedCodexPath, safeEvent, sanitizedEnvironment };
