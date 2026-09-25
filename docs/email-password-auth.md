# Email accounts

Initial release: PR #365 was deployed to the canonical web game on September 25, 2026. The signup feedback and theme follow-up on `codex/email-signup-and-theme` is pending review and deployment.

## Behavior

Google and email/password share the existing Firebase identity and kingdom storage. The login page opens a native dialog for email sign-in, account creation, or password recovery. Password creation uses a minimum of 12 characters, supports passphrases/autofill, and never stores credentials in game data or diagnostics.

Raw Firebase authentication is exposed separately as `getAuthUser()`. `getUser()` and `isSignedIn()` represent gameplay eligibility. Unverified password sessions cannot activate gameplay, read/write protected Firestore data, register installations, claim a city, or call either server wrapper. Callables reject with `permission-denied` and `details.reason = email-verification-required` before realm lookup. Verified password sessions, existing Google sessions, and trusted custom-token sessions retain their normal authority checks.

Verification refresh reloads the user and forces an ID-token refresh before admission. Resending has a 60-second client cooldown in addition to Firebase throttling. Recovery returns the same neutral message for unknown and registered addresses. Hosting handles expired/used action links; players can request a new message from the game.

Profile Settings → Account → Add a password reauthenticates the same Google identity before presenting the password form. Blocked popups fall back to reauthentication by redirect; only the UID identifying the intended flow is stored in session storage, never a password or credential. The SDK links the same email and UID. No separate-account merging, provider removal, or email changes are implemented.

## Release configuration and order

Implementation authorization does not authorize production changes. After explicit merge/deploy authorization:

1. Hold web auto-publication for the coordinated release. Record the current web deploy and backend/rules versions. Merge only with all required checks green and a clean current branch; synchronize local main using the documented fast-forward workflow.
2. Deploy the merged Functions and Firestore rules first. The shared callable wrappers change, so deploy all affected callable functions rather than only login functions. Verify verification-required errors and normal Google access before exposing the feature.
3. In Firebase Authentication for `crown-land-b15e0`, enable **Email/Password**, keeping passwordless email-link sign-in disabled. Configure the password policy in **Require** mode with minimum length **12**, no additional character-class requirements, and the existing provider maximum. Keep duplicate emails disabled and email-enumeration protection enabled.
4. Review the verification and password-reset templates with Crown Lands branding. Retain Firebase-hosted action handlers, the authorized `playcrownlands.com` domain, and the fixed continuation URL `https://playcrownlands.com/play/`. No custom SMTP or password backend is required.
5. Publish the matching web artifact and restore the prior auto-publication setting. Verify exact frontend/backend versions and the service worker asset inventory. Check alternate hosts resolve to the canonical game. itch.io publication remains a separate channel.
6. With controlled test accounts, check delivery/verification/reset, Google popup and redirect login, same-UID Google-to-password linking, email-to-Google access, sign-out/reload, and two-device takeover. Verify the linked account's name, complete flag, cities, troops, Gold and King Power remain intact. Confirm action links opened in another browser/device require that browser to sign in normally. Include Android and iOS installed/browser flows with the keyboard visible.
7. Compare authentication error categories and verification denials without recording emails, passwords, tokens, action codes, or player data. Never log the complete Firebase Auth project configuration; select only non-sensitive leaf settings.

Rollback must preserve email login and recovery once password players exist. Do not disable Email/Password or revert to a Google-only frontend that strands those players. Retain verification gates; prefer a forward fix or a compatible client rollback.

## Validation evidence and limits

The new UI and integration add approximately 27 KiB of uncompressed client source relative to the base. The production artifact assigns this feature a bounded 32 KiB allowance and separately caps `email-auth-ui.js` at 14 KiB. Existing total-artifact, world, and installation-cache budgets are otherwise unchanged.

- `tools/validate-email-auth.js` exercises real client methods with SDK fixtures: no game work before verification, one activation afterward, duplicate-operation rejection, same-UID password linking without session takeover, recovery, and stale account callbacks. It also executes both real callable wrappers to prove verification is checked before realm reads.
- `tools/validate-email-auth-browser.js` runs the actual email UI and Firebase client together with SDK fixture responses at 1440×900, 844×390, and 568×320. Native browser typing covers inline invalid-email, short-password and mismatch explanations, failed signup/retry, duplicate submission, delivery failure/resend, verification, recovery, and same-UID linking. It checks the shared parchment/burgundy palette and viewport bounds. Screenshots are written to ignored `release-artifacts/email-auth/`. These are local browser tests, not physical-device or live-email evidence.
- `functions/test/emulator-email-auth.js` verifies real Auth tokens, Firestore reads/writes, and callable authorization. Existing gameplay signup factories now explicitly use verified players with refreshed tokens through the emulator-only helper.
- Firebase Tools 15.22.4's Auth emulator rejects same-email `accounts:signUp` linking before resolving the provided ID token. The integration fixture therefore adds a password through emulator Admin and checks subsequent password authentication, UID/provider retention, and unchanged kingdom data. It does **not** prove live linking or email delivery. The production SDK remains on 10.12.5 and calls the supported token-bearing signup endpoint through `linkWithCredential`; complete that controlled-account release check before claiming the feature live.

References: [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [account management](https://firebase.google.com/docs/auth/web/manage-users), [SDK linking implementation](https://github.com/firebase/firebase-js-sdk/blob/firebase%4010.12.5/packages/auth/src/api/account_management/email_and_password.ts).

## Signup feedback and theme follow-up

The original form relied on native constraint-validation popups. Invalid entries could prevent the submit handler from running without an inline explanation. The form now validates email, required password, the existing 12-character minimum, and confirmation itself, focusing the affected field and scrolling the explanation into view. Account creation can succeed before verification delivery fails; the verification panel now retains that failure's specific explanation and the resend action. Passwords still clear after an authentication attempt.

The dialog uses the game's existing parchment, burgundy, brass, typography, and compact corners instead of hard-coded navy colors. Authentication rules and Firebase settings are unchanged.

The local release gate also exposed checkout-dependent artifact sizes: Windows CRLF text copies exceeded the base payload budget while Linux LF copies did not. The builder now normalizes copied text in the output to LF; source files, binary assets, and payload limits are unchanged. Artifact validation rejects CRLF output.

Investigation confirmed production Email/Password is enabled with the expected minimum length and canonical return domain. A full local browser run using the actual Firebase SDK and Auth emulator successfully created an unverified account and presented verification. A subsequent screenshot confirmed the generic fallback error, but did not expose its underlying code. The live page's SDK mapped an intercepted `EMAIL_EXISTS` response to the existing-account guidance correctly; interception prevented account creation and email delivery. The exact device failure and real mailbox delivery remain unverified. This follow-up fixes confirmed feedback/theme defects and must not be represented as proof that all production signup failures are resolved.

The creation hint explains that existing Google players should use Settings → Account → Add a password after Google sign-in. Unavailable authentication now asks players to reload. Other unhandled errors include only a bounded Firebase code or the fixed `email/client-error` reference for support; raw error messages, custom data, credentials and account information are excluded. Browser coverage exercises existing-email, already-signed-in, unavailable, internal and uncoded failures, including private-data redaction and password clearing.
