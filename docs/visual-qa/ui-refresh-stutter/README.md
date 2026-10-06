# Open-window refresh stutter

`codex/ui-refresh-stutter` starts at `996fb9a2095fac6c66cd567fd91a45fde84b2ce5` (PR #468). Implementation and PR review are authorized. Merge and deployment require separate authorization.

The actual-game benchmark reproduced two sources of work behind open screens. The active march HUD continuously animated a filter and shadow beneath the backdrop, forcing a style/render pass on each display frame. Profile recreated unchanged production spans and achievement-button content every second. Skills also rewrote unchanged button attributes, and City Details compared markup strings against browser-normalized HTML and repeatedly replaced passive wall information.

The existing overlay observer now pauses only HUD decoration while a dialog, Profile or setup screen covers it. It tracks dynamically created and nested dialogs, resumes after the last overlay closes or is removed, and preserves Full/Reduced/Off preferences. Existing timer, simulation, alert and synchronization cadences continue. Profile/Skills/navigation update only changed presentation values. City Details uses the existing operation text patcher and retains full troop-count formatting throughout its refresh.

Controlled before/after measurements use scenario A with no visual marches, isolated benchmark services and server-authority presentation, on a Windows Chrome host near 144 Hz. Each sample lasts four seconds. A 4× CPU diagnostic exposed the covered HUD animation cost; these are local browser measurements, not production latency or physical phone guarantees. The baseline, final samples and diagnostic animation isolation are retained under ignored `release-artifacts/ui-stutter/`.

| Open window, 4× CPU | Before p95 frame time | Final p95 frame time |
| --- | ---: | ---: |
| Skills | 27.8 ms | 7.0 ms |
| Profile | 20.9 ms | 7.1 ms |
| City Details | 27.8 ms | 7.0 ms |
| Help | 34.7 ms | 7.1 ms |

At normal CPU speed, unchanged Skills mutations fell from 132 to zero per sample, Profile from 188 to 36, and City Details from 66 to six. No element replacements remain in these final samples. The remaining Profile and City mutations belong to existing flag/push/rally metadata. Normal-CPU main-thread task time fell from about 1.26–1.30 seconds to 0.15–0.21 seconds per four-second sample. These short diagnostics vary with host load; CI asserts behavior rather than hardware-specific FPS thresholds.

The new browser regression checks unchanged Skills mutations, retained production/achievement/wall nodes and keyboard focus, live skill eligibility/Gold/production/garrison values, achievement badges, the production detail dialog, covered HUD motion across City/Help/Shop/Bag/Skills/Profile, nested overlay close/removal, and motion preferences. It captures 1440×900, 844×390 and 568×320. Existing focused tests cover City Details actions and repair, skill synchronization, shared UI refresh and modal/onboarding lifecycle; asset budgets protect startup packaging.

Gameplay, balance, world topology, backend contracts and authoritative requests are unchanged. No Functions, rules, indexes, migrations or production account mutations are required. Release status remains pending until an authorized merge/deployment is verified.
