(function () {
  "use strict";
  const element = id => document.getElementById(id);
  const api = () => window.CrownlandsOnline;
  const dialog = element("emailAuthDialog"), form = element("emailAuthForm");
  if (!dialog || !form) return;
  const address = element("emailAuthAddress"), password = element("emailAuthPassword"), confirm = element("emailAuthConfirm");
  const status = element("emailAuthStatus"), submit = element("emailAuthSubmit");
  const titles = { signIn: "Sign in with email", create: "Create account", reset: "Reset password", link: "Add a password" };
  let mode = "signIn", pending = false, dialogUid = "", lastAuthUid = "", resendTimer = 0;
  const redirectKey = "crownlands-add-password-uid";

  function message(error) {
    const code = String(error?.code || "");
    if (["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "Email or password was not accepted. Try again, reset your password, or use Google.";
    if (["auth/email-already-in-use", "auth/credential-already-in-use", "auth/account-exists-with-different-credential"].includes(code)) return "Could not use that email. Try signing in or resetting your password. Google players can sign in with Google and add a password in Settings.";
    if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") return "Use a password with at least 12 characters.";
    if (code === "auth/invalid-email") return "Enter a valid email address.";
    if (code === "auth/too-many-requests" || code === "auth/resend-cooldown") return "Please wait before trying again.";
    if (code === "auth/network-request-failed") return "Could not connect. Check your connection and try again.";
    if (code === "auth/requires-recent-login") return "Close this form and select Add a password to confirm your Google account again.";
    if (code === "auth/user-mismatch") return "Your account changed. Please try again with your current account.";
    if (code === "auth/popup-closed-by-user") return "Google confirmation was cancelled. Your account has not changed.";
    if (code === "auth/operation-not-allowed") return "Email sign-in is not available yet. Please use Google for now.";
    if (code.startsWith("functions/")) return "Your account connected, but the game is temporarily busy. Try again shortly.";
    return "Could not finish. Please try again.";
  }

  function clearPasswords() {
    password.value = ""; confirm.value = "";
    password.type = "password"; confirm.type = "password";
    element("emailShowPasswordBtn").textContent = "Show password";
    element("emailShowPasswordBtn").setAttribute("aria-pressed", "false");
  }

  function open(nextMode) {
    if (pending || api()?.isAuthBusy?.()) return;
    mode = nextMode;
    dialogUid = api()?.getAuthUser?.()?.uid || "";
    clearPasswords(); status.textContent = "";
    element("emailAuthTitle").textContent = titles[mode];
    element("emailAuthHint").textContent = mode === "link" ? "Use either Google or this password to reach the same kingdom. Use at least 12 characters."
      : mode === "create" ? "Use at least 12 characters. Verify your email before entering your kingdom."
        : mode === "reset" ? "We’ll send recovery instructions if this email can receive them." : "Continue to your kingdom.";
    submit.textContent = mode === "reset" ? "Send reset email" : mode === "signIn" ? "Sign in" : titles[mode];
    element("emailPasswordFields").hidden = mode === "reset";
    element("emailConfirmField").hidden = !["create", "link"].includes(mode);
    password.required = mode !== "reset"; password.disabled = mode === "reset";
    password.minLength = ["create", "link"].includes(mode) ? 12 : 1;
    password.autocomplete = mode === "signIn" ? "current-password" : "new-password";
    confirm.required = ["create", "link"].includes(mode); confirm.disabled = !confirm.required;
    element("emailForgotBtn").hidden = mode !== "signIn";
    element("emailAuthModeBtn").hidden = mode === "link";
    element("emailAuthModeBtn").textContent = mode === "signIn" ? "Create account" : "Sign in instead";
    address.readOnly = mode === "link";
    if (mode === "link") address.value = api().getAuthUser().email;
    if (!dialog.open) dialog.showModal();
    (mode === "link" ? password : address).focus();
  }

  function render() {
    const online = api(), user = online?.getAuthUser?.();
    const busy = pending || Boolean(online?.isAuthBusy?.());
    const unverified = Boolean(user && !online.isSignedIn());
    const uid = user?.uid || "";
    if (uid !== lastAuthUid) {
      element("emailVerificationStatus").textContent = "";
      element("emailAccountStatus").textContent = "";
      if (dialog.open && mode === "link" && uid !== dialogUid) dialog.close();
      lastAuthUid = uid;
    }
    element("emailSignInBtn").hidden = Boolean(user);
    element("emailSignInBtn").disabled = busy || !online?.isReady?.() || !online?.isConfigured?.();
    element("emailVerificationPanel").hidden = !unverified;
    element("emailVerificationDetail").textContent = unverified ? `Verify ${user.email}, then return here to enter your kingdom.` : "";
    element("emailVerifiedBtn").disabled = busy;
    const remaining = Math.max(0, Math.ceil(((online?.getVerificationResendAtMs?.() || 0) - Date.now()) / 1000));
    element("emailResendBtn").disabled = busy || remaining > 0;
    element("emailResendBtn").textContent = remaining > 0 ? `Resend in ${remaining}s` : "Resend email";
    clearTimeout(resendTimer);
    if (unverified && remaining > 0) resendTimer = setTimeout(render, 1000);
    const google = element("googleSignInBtn"), signOut = element("googleSignOutBtn");
    if (unverified) { google.hidden = true; signOut.hidden = false; }
    if (busy) google.disabled = true;
    else if (!user) google.disabled = !online?.isReady?.() || !online?.isConfigured?.();
    signOut.disabled = busy;
    const hasPassword = user?.providerIds?.includes("password");
    element("emailAccountDetail").textContent = user ? `${user.email} · ${hasPassword ? (user.providerIds.includes("google.com") ? "Google and password" : "Email and password") : "Google"}` : "Sign in to manage your account.";
    element("emailAddPasswordBtn").hidden = !user?.providerIds?.includes("google.com") || hasPassword || !user.emailVerified;
    element("emailAccountResetBtn").hidden = !hasPassword;
    element("emailAddPasswordBtn").disabled = busy;
    element("emailAccountResetBtn").disabled = busy;
    for (const control of form.querySelectorAll("button, input")) control.disabled = busy;
    if (!busy) { password.disabled = mode === "reset"; confirm.disabled = !["create", "link"].includes(mode); }
    form.setAttribute("aria-busy", String(busy));
  }

  async function action(output, operation, success) {
    if (pending || api()?.isAuthBusy?.()) return;
    const uid = api()?.getAuthUser?.()?.uid || "";
    pending = true; output.textContent = "Connecting…"; render();
    try {
      const result = await operation();
      if ((api()?.getAuthUser?.()?.uid || "") === uid) output.textContent = typeof success === "function" ? success(result) : success;
    } catch (error) {
      if ((api()?.getAuthUser?.()?.uid || "") === uid) output.textContent = message(error);
    } finally { pending = false; render(); }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending || api()?.isAuthBusy?.() || !form.reportValidity()) return;
    if (["create", "link"].includes(mode) && password.value !== confirm.value) { status.textContent = "The passwords do not match."; return; }
    const submittedMode = mode, submittedUid = dialogUid;
    const secret = password.value, email = address.value;
    clearPasswords(); pending = true; status.textContent = "Connecting…"; render();
    try {
      if (mode === "reset") {
        await api().sendPasswordRecovery(email);
        status.textContent = "If this email can receive recovery instructions, they are on their way. Check your inbox and spam folder.";
      } else if (mode === "link") {
        await api().addEmailPassword(secret);
        if (api().getAuthUser()?.uid === submittedUid) {
          if (api().isSignedIn()) element("emailAccountStatus").textContent = "Password added. Google and email sign-in both open this kingdom.";
          else element("emailVerificationStatus").textContent = "Password added. Verify your email to return to this kingdom.";
        }
        dialog.close();
      } else {
        await api().signInWithEmail(email, secret, { create: mode === "create" });
        dialog.close();
      }
    } catch (error) {
      // Account creation can succeed even if delivery of its verification email fails.
      if (["signIn", "create"].includes(submittedMode) && api()?.getAuthUser?.() && !api().isSignedIn()) {
        dialog.close(); element("emailVerificationStatus").textContent = "Your account is created. Use Resend email if verification has not arrived.";
      } else if (submittedMode !== "link" || api()?.getAuthUser?.()?.uid === submittedUid) status.textContent = message(error);
    } finally { pending = false; clearPasswords(); render(); }
  });

  element("emailSignInBtn").addEventListener("click", () => open("signIn"));
  element("emailAuthModeBtn").addEventListener("click", () => open(mode === "signIn" ? "create" : "signIn"));
  element("emailForgotBtn").addEventListener("click", () => open("reset"));
  element("emailAuthBackBtn").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => { if (pending) event.preventDefault(); });
  dialog.addEventListener("close", clearPasswords);
  element("emailShowPasswordBtn").addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = confirm.type = visible ? "text" : "password";
    element("emailShowPasswordBtn").textContent = visible ? "Hide password" : "Show password";
    element("emailShowPasswordBtn").setAttribute("aria-pressed", String(visible));
  });
  const verify = () => action(element("emailVerificationStatus"), () => api().refreshEmailVerification(), verified => verified ? "Email verified. Your kingdom is ready." : "Not verified yet. Open the link in your email, then try again.");
  element("emailVerifiedBtn").addEventListener("click", verify);
  element("emailResendBtn").addEventListener("click", () => action(element("emailVerificationStatus"), () => api().sendVerificationEmail(), "Verification email sent. Check your inbox and spam folder."));
  element("emailAccountResetBtn").addEventListener("click", () => action(element("emailAccountStatus"), () => api().sendPasswordRecovery(api().getAuthUser().email), "If recovery instructions can be sent, they are on their way."));
  element("emailAddPasswordBtn").addEventListener("click", async () => {
    const uid = api()?.getAuthUser?.()?.uid;
    try { sessionStorage.setItem(redirectKey, uid); } catch (_) { /* Popup linking still works without storage. */ }
    let confirmed = false;
    await action(element("emailAccountStatus"), async () => { confirmed = await api().reauthenticateGoogleForPassword(); }, "Google confirmed. Choose a password.");
    if (confirmed && api()?.getAuthUser?.()?.uid === uid) {
      try { sessionStorage.removeItem(redirectKey); } catch (_) { /* Optional flow marker. */ }
      open("link");
    }
  });
  window.addEventListener("crownlands:auth-ui", event => {
    render();
    if (event.detail?.reauthenticated) {
      let uid;
      try { uid = sessionStorage.getItem(redirectKey); sessionStorage.removeItem(redirectKey); } catch (_) { return; }
      if (uid && uid === api()?.getAuthUser?.()?.uid) open("link");
    }
  });
  window.addEventListener("crownlands:auth", render);
  window.addEventListener("crownlands:online-ready", render);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && api()?.getAuthUser?.() && !api().isSignedIn()) verify();
  });
  render();
})();
