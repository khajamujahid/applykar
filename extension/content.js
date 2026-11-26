(function () {
  if (window.__applykarMounted) return;
  window.__applykarMounted = true;

  var pageApi = globalThis.ApplykarPage;
  if (!pageApi) return;

  function readPage() {
    var heading = document.querySelector("h1");
    var companyNode = document.querySelector("[data-company], .company-name, .posting-headline .sort-by-team, .app-title");
    var locationNode = document.querySelector("[data-location], .location, .posting-categories .sort-by-location");
    var main = document.querySelector("main, [role='main'], .content, body");
    return pageApi.extractJob({
      url: location.href,
      title: document.title,
      headings: heading ? [heading.innerText] : [],
      company: companyNode ? companyNode.textContent : "",
      siteName: (document.querySelector("meta[property='og:site_name']") || {}).content || "",
      location: locationNode ? locationNode.textContent : "",
      text: main ? main.innerText.slice(0, 12000) : "",
    });
  }

  function looksLikeJob(job) {
    if (pageApi.serverApplySource(job.url) || pageApi.isHandsOffHost(job.url)) return true;
    var host = "";
    try { host = new URL(job.url).hostname; } catch (error) { return false; }
    if (/greenhouse|lever\.co|ashbyhq|myworkday|icims|smartrecruiters|workable/.test(host)) return true;
    var blob = (job.title + " " + job.description).toLowerCase();
    return /\b(apply|job description|responsibilities|qualifications)\b/.test(blob) && job.title.length > 3;
  }

  function toast(message, tone) {
    var node = document.getElementById("applykar-toast");
    if (!node) return;
    node.hidden = false;
    node.dataset.tone = tone || "info";
    node.textContent = message;
  }

  function labels() {
    return Array.prototype.map.call(document.querySelectorAll("label"), function (label) {
      return label.innerText || "";
    });
  }

  function fill(plan) {
    plan.filled.forEach(function (item) {
      var label = Array.prototype.find.call(document.querySelectorAll("label"), function (node) {
        return (node.innerText || "").replace(/\s+/g, " ").trim() === item.label;
      });
      if (!label) return;
      var id = label.getAttribute("for");
      var field = id ? document.getElementById(id) : label.querySelector("input, textarea, select");
      if (!field || field.type === "file") return;
      if (field.tagName === "SELECT") {
        var option = Array.prototype.find.call(field.options, function (choice) {
          return choice.text.trim().toLowerCase() === item.value.trim().toLowerCase();
        });
        if (option) field.value = option.value;
      } else {
        field.value = item.value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  var root = document.createElement("div");
  root.id = "applykar-root";
  root.innerHTML = '<div id="applykar-toast" hidden></div><button type="button" id="applykar-apply">Apply with Applykar</button><button type="button" id="applykar-fill">Autofill this page</button>';
  document.documentElement.appendChild(root);

  var job = readPage();
  if (!looksLikeJob(job)) root.hidden = true;

  document.getElementById("applykar-apply").addEventListener("click", function () {
    var captured = readPage();
    toast("Sending to Applykar…", "info");
    chrome.runtime.sendMessage({ type: "capture", job: captured }, function (response) {
      if (chrome.runtime.lastError || !response) {
        toast(chrome.runtime.lastError ? chrome.runtime.lastError.message : "Pair the extension in Applykar settings.", "error");
        return;
      }
      if (response.error) {
        toast(response.error, "error");
        return;
      }
      toast(response.message || (response.queued ? "Queued on your apply worker." : "Saved."), response.queued ? "ok" : "info");
    });
  });

  document.getElementById("applykar-fill").addEventListener("click", function () {
    toast("Reading saved answers…", "info");
    chrome.runtime.sendMessage({ type: "answers" }, function (response) {
      if (!response || !response.answers) {
        toast("Pair the extension before autofill.", "error");
        return;
      }
      var plan = pageApi.planAutofill(labels(), response.answers);
      fill(plan);
      var note = "Filled " + plan.filled.length + ".";
      if (plan.skipped.length) note += " Left blank: " + plan.skipped.slice(0, 3).join(", ") + ".";
      note += " Submit the page yourself.";
      toast(note, plan.filled.length ? "ok" : "info");
    });
  });
})();
