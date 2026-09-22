# Help / First Steps design review

Verified September 22, 2026 using a fresh Chromium session against the local draft.

- Desktop: 1440 × 900.
- Mobile landscape: 844 × 390.
- Small mobile landscape: 568 × 320.
- All five chapters and all 21 topics rendered without horizontal overflow. The last topic remains reachable in the reading pane. The footer actions remain in view.
- Search covers all chapters, including Shield and conditional retaliation / reconquer guidance. Empty results and HTML-like search input are handled safely.
- Expanded explanations and chapter scroll positions persist while the draft is open. Chapter keyboard navigation, related-chapter buttons, close/reopen and the review chapter selector passed.
- First-steps tips change local preview memory only. No account preference, tutorial progress or backend state is written.
- Current image assets load; scout and dispatch use the existing SVG symbols. Desktop and landscape screenshots were inspected visually. The landscape introduction was tightened to expose more of the first topic cards.
- On the narrowest landscape size, the introductory illustration and repeated chapter summary are omitted, leaving the title and full topic content. Both chapter navigation and the reading pane scroll independently.

Command: `node tools/validate-help-first-steps-draft-browser.js`.

Screenshots are generated in ignored `release-artifacts/help-first-steps-draft/`; they are review evidence, not shipped assets. This is a draft only: approval and actual `showHelpModal` integration remain outstanding. No deployment occurred.
