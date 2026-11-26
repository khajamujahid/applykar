(function (root) {
  function isHandsOffHost(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "indeed.com" || host.endsWith(".indeed.com");
    } catch (error) {
      return false;
    }
  }

  function serverApplySource(url) {
    if (isHandsOffHost(url)) return null;
    try {
      var host = new URL(url).hostname.toLowerCase();
      if (host.includes("greenhouse.io")) return "greenhouse";
      if (host.includes("lever.co")) return "lever";
      if (host.includes("ashbyhq.com")) return "ashby";
      return null;
    } catch (error) {
      return null;
    }
  }

  function text(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function extractJob(page) {
    var heading = text((page.headings && page.headings[0]) || page.title || "");
    var company = text(page.company || "");
    if (!company && page.title && page.title.indexOf(" at ") > 0) company = text(page.title.split(" at ").pop());
    if (!company) company = text(page.siteName || "");
    var location = text(page.location || "");
    if (!location && /remote/i.test(page.text || "")) location = "Remote";
    return {
      url: page.url,
      title: heading.replace(/\s+[|–-]\s+.*$/, "").slice(0, 180),
      company: company.slice(0, 120),
      location: location.slice(0, 160),
      description: text(page.text || "").slice(0, 8000),
    };
  }

  var RULES = [
    { key: "work_authorization", pattern: /authori[sz]ed to work|work authorization|legally authori[sz]ed|eligible to work/i },
    { key: "sponsorship", pattern: /sponsor|visa|h-?1b/i },
    { key: "willing_to_relocate", pattern: /relocat/i },
    { key: "salary_expectation", pattern: /salary|compensation|pay expectation|desired pay/i },
    { key: "employment_type", pattern: /employment type|corp-?to-?corp|\bc2c\b|\bw-?2\b/i },
    { key: "availability", pattern: /start date|when can you start|available to start|availability/i },
    { key: "work_location", pattern: /where (?:can|do) you|work location|preferred location/i },
    { key: "eeo_gender", pattern: /\bgender\b/i },
    { key: "eeo_race", pattern: /race|ethnicity/i },
    { key: "eeo_veteran", pattern: /veteran/i },
    { key: "eeo_disability", pattern: /disability/i },
  ];

  function planAutofill(labels, answers) {
    var filled = [];
    var skipped = [];
    labels.forEach(function (label) {
      var name = text(label);
      if (!name || /resume|cv\b/i.test(name)) return;
      var rule = RULES.find(function (item) { return item.pattern.test(name); });
      var saved = rule && answers.find(function (answer) { return answer.key === rule.key && text(answer.answer); });
      if (!saved) skipped.push(name);
      else filled.push({ label: name, value: saved.answer.trim() });
    });
    return { filled: filled, skipped: skipped };
  }

  var api = {
    isHandsOffHost: isHandsOffHost,
    serverApplySource: serverApplySource,
    extractJob: extractJob,
    planAutofill: planAutofill,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ApplykarPage = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
