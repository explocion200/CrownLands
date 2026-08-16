# Codex AI routing and agent profiles

AUTO is the normal mode. V1 uses an understandable deterministic policy rather than an opaque classifier. The decision is stored with every task and shown before execution.

## Capability roles and defaults

| Role | Default model mapping | Intended work | Default reasoning |
|---|---|---|---|
| Deep | `gpt-5.6-sol` | Architecture, multi-file features, backend, complex debugging | High |
| Fast | `gpt-5.6-luna` | Focused UI, cleanup, small isolated fixes | Medium |
| Visual | `gpt-5.6-terra` | Screenshot-backed visual reasoning | Medium |
| QA | `gpt-5.6-luna` | Audits and focused regression work | Medium |
| Performance | `gpt-5.6-sol` | Profiling and performance architecture | High |
| Review | `gpt-5.6-terra` | Read-only review and documentation | Medium |

These are editable mappings, not model-name branches in application logic. If a selected model reports that it is unavailable, Studio records the failure and retries with the configured fallback; if that is also unavailable, it visibly tries the Codex default. Other failures do not silently switch models.

The August 2026 defaults follow the official current model guidance: Sol for the deepest agentic coding work, Terra for balanced reasoning, and Luna for fast cost-efficient tasks. Because availability changes, the settings store model IDs as configuration and the runtime provides an explicit fallback path. See [OpenAI model selection](https://developers.openai.com/api/docs/guides/latest-model) and the [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

## Specialized agents

| Agent | Main classification | Normal role | Escalation behavior |
|---|---|---|---|
| Feature Builder | Feature / Refactor / Mixed | Deep | Remains Deep for architectural work |
| UI Craftsman | UI | Fast | Escalates to Deep for cross-screen/shared architecture |
| Bug Hunter | Bug | Fast | Uses Deep for cross-system/root-cause signals |
| QA Inspector | QA / Documentation | QA or Review | Uses Deep only when the task becomes architectural |
| Performance Engineer | Performance | Performance | Deep reasoning by default |
| Map Engineer | Map | Fast | Deep for generation architecture, performance, or rule changes |
| Economy Designer | Economy | Deep | Analyzes current client/server formulas before changes |

Every profile inherits `AGENTS.md`, the selected task permission, production restrictions, and the same worktree boundary.

## Policy signals

Classification examines the prompt plus structured selected context. It considers UI, feature, bug, QA, performance, map, economy, refactor, documentation, and mixed signals. Complexity/risk increases for backend/Firebase, persistence, schemas, data models, migrations, cross-file/shared systems, performance, server authority, security, combat/progression/economy-wide changes, or broad “all/every/across” scope.

Focused color, text, CSS, spacing, alignment, or button tasks normally stay Fast and low risk. Generic “fix” language does not turn an obvious UI-polish request into a Bug Hunter task; explicit reproduction/root-cause/crash/failure language does.

Manual agent and advanced model overrides are validated and recorded. The router can still raise the capability role when the prompt contains higher-complexity signals, so a specialist is not permanently locked to its usual model depth.

## Multi-agent metadata

High-complexity Feature, Mixed, and Refactor plans can contain Architecture → Implementation/UI → QA → Review nodes with explicit dependencies and parallel-safety flags. Phase 2B displays and persists this graph but runs a single coordinated lead thread. This avoids parallel edits to overlapping files until a later scheduler can prove safe isolation and reconciliation.
