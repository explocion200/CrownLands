"use strict";
document.getElementById("test-login").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.target.querySelector("button"), status = document.getElementById("login-status"); button.disabled = true;
  status.textContent = "Opening the private test…";
  try {
    const response = await fetch("./login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("email").value, password: document.getElementById("password").value }) });
    document.getElementById("password").value = "";
    if (!response.ok) throw Error("Test credentials were not accepted. Use the temporary credentials on this computer.");
    location.replace("./?catalog=full");
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
