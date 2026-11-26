const pair = document.getElementById("pair");
const ready = document.getElementById("ready");
const baseUrl = document.getElementById("baseUrl");
const token = document.getElementById("token");
const pairError = document.getElementById("pairError");
const profile = document.getElementById("profile");
const apps = document.getElementById("apps");

function showError(message) {
  pairError.hidden = false;
  pairError.textContent = message;
}

async function load() {
  const stored = await chrome.storage.local.get(["baseUrl", "token"]);
  baseUrl.value = stored.baseUrl || "http://127.0.0.1:4317";
  if (!stored.token) return;
  token.value = stored.token;
  const response = await fetch(stored.baseUrl.replace(/\/$/, "") + "/api/extension/me", {
    headers: { authorization: "Bearer " + stored.token },
  });
  if (!response.ok) {
    showError("That token was refused. Create a new one in Settings.");
    return;
  }
  const data = await response.json();
  pair.hidden = true;
  ready.hidden = false;
  profile.innerHTML = "";
  data.profiles.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.active;
    profile.appendChild(option);
  });
  apps.innerHTML = "";
  (data.applications || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.title + " · " + item.status.replaceAll("_", " ");
    apps.appendChild(li);
  });
  if (!data.applications?.length) {
    const li = document.createElement("li");
    li.textContent = "No applications yet.";
    apps.appendChild(li);
  }
}

document.getElementById("save").addEventListener("click", async () => {
  pairError.hidden = true;
  await chrome.storage.local.set({ baseUrl: baseUrl.value.trim(), token: token.value.trim() });
  await load();
});

profile.addEventListener("change", async () => {
  const stored = await chrome.storage.local.get(["baseUrl", "token"]);
  await fetch(stored.baseUrl.replace(/\/$/, "") + "/api/extension/profile", {
    method: "POST",
    headers: { authorization: "Bearer " + stored.token, "content-type": "application/json" },
    body: JSON.stringify({ profileId: profile.value }),
  });
  await load();
});

document.getElementById("forget").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token"]);
  ready.hidden = true;
  pair.hidden = false;
});

load();
