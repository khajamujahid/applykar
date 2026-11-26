async function settings() {
  return chrome.storage.local.get(["baseUrl", "token"]);
}

async function api(path, options) {
  const stored = await settings();
  if (!stored.baseUrl || !stored.token) return { error: "Pair the extension from Applykar settings." };
  const response = await fetch(stored.baseUrl.replace(/\/$/, "") + path, {
    method: options?.method || "GET",
    headers: {
      authorization: "Bearer " + stored.token,
      "content-type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: payload.error || "Applykar refused the request." };
  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "capture") {
    api("/api/extension/capture", { method: "POST", body: message.job }).then(sendResponse);
    return true;
  }
  if (message.type === "answers") {
    api("/api/extension/me").then((payload) => sendResponse({ answers: payload.answers || null, error: payload.error }));
    return true;
  }
  return false;
});
