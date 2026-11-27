const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const form = document.querySelector("form") || document.body;
const questions = [];
const used = new Set();

const selectorFor = (control) => {
  if (control.id) return `#${CSS.escape(control.id)}`;
  const name = control.getAttribute("name");
  return name ? `[name="${CSS.escape(name)}"]` : "";
};

const groupHeading = (control) => {
  const box = control.closest(".application-question, fieldset, [role='radiogroup'], [role='group']");
  if (!box) return "";
  const labelledBy = box.getAttribute("aria-labelledby");
  const byId = labelledBy ? document.getElementById(labelledBy.split(" ")[0]) : null;
  const head = byId || box.querySelector("legend, .application-label .text, .application-label");
  return clean(head ? head.textContent : "");
};

for (const label of form.querySelectorAll("label")) {
  // Lever-style labels wrap helper text (e.g. location dropdown messages); prefer the explicit label element.
  const own = label.querySelector(".application-label");
  const text = clean((own || label).textContent);
  if (!text || text.length > 240 || /^(attach|enter manually)$/i.test(text)) continue;
  const forId = label.getAttribute("for");
  let control = forId ? document.getElementById(forId) : null;
  if (!control) {
    const scope = label.closest("li, .application-question, .application-field") || label.parentElement;
    control = scope ? scope.querySelector("input:not([type='hidden']), textarea, select") : null;
  }
  if (!control || used.has(control)) continue;
  const type = (control.getAttribute("type") || control.tagName).toLowerCase();
  if (type === "hidden" || type === "radio" || type === "checkbox" || type === "submit" || type === "button") continue;
  const id = selectorFor(control);
  if (!id) continue;
  used.add(control);
  const options =
    control.tagName === "SELECT"
      ? [...control.querySelectorAll("option")]
          .map((option) => clean(option.textContent))
          .filter((option) => option.length > 0 && !/^select/i.test(option))
      : [];
  const required = control.hasAttribute("required") || /[*✱]/.test(text);
  const kind = type === "file" || /resume|curriculum vitae|\bcv\b/i.test(text) ? "file" : "text";
  questions.push({ id, label: text, required, kind, options });
}

// Fields with no <label> (Lever custom cards, aria-only inputs): use the question block heading or aria-label.
for (const control of form.querySelectorAll("input, textarea, select")) {
  if (used.has(control)) continue;
  const type = (control.getAttribute("type") || control.tagName).toLowerCase();
  if (["hidden", "radio", "checkbox", "submit", "button", "search"].includes(type)) continue;
  if (control.offsetParent === null && type !== "file") continue;
  const id = selectorFor(control);
  if (!id) continue;
  const text = groupHeading(control) || clean(control.getAttribute("aria-label"));
  if (!text || text.length > 240) continue;
  used.add(control);
  const options =
    control.tagName === "SELECT"
      ? [...control.querySelectorAll("option")].map((option) => clean(option.textContent)).filter((option) => option.length > 0 && !/^select/i.test(option))
      : [];
  const required = control.hasAttribute("required") || control.getAttribute("aria-required") === "true" || /[*✱]/.test(text);
  const kind = type === "file" || /resume|curriculum vitae|\bcv\b/i.test(text) ? "file" : "text";
  questions.push({ id, label: text, required, kind, options });
}

const groups = new Map();
for (const control of form.querySelectorAll("input[type='radio'], input[type='checkbox']")) {
  if (!control.name || used.has(control)) continue;
  const list = groups.get(control.name) || [];
  list.push(control);
  groups.set(control.name, list);
}
for (const [name, controls] of groups) {
  const options = controls
    .map((control) => {
      const optionLabel = control.id ? form.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
      return clean(optionLabel ? optionLabel.textContent : control.value);
    })
    .filter((option) => option.length > 0);
  let question = "";
  let headingEl = null;
  let node = controls[0] ? controls[0].parentElement : null;
  for (let depth = 0; depth < 8 && node && !question; depth += 1) {
    const labels = [...node.querySelectorAll("label")];
    const heading = labels.find((label) => {
      const targetId = label.getAttribute("for");
      const target = targetId ? document.getElementById(targetId) : null;
      const targetType = target ? target.getAttribute("type") : null;
      // A label that wraps one option (Lever "Yes"/"No") is an answer, not the question.
      if (!target && label.querySelector("input[type='radio'], input[type='checkbox']") && options.includes(clean(label.textContent))) return false;
      return !target || (targetType !== "radio" && targetType !== "checkbox");
    });
    question = clean(heading ? heading.textContent : "");
    headingEl = heading || null;
    node = node.parentElement;
  }
  // If the nearest label belongs to a different question block, use this block's own heading instead.
  const box = controls[0] ? controls[0].closest(".application-question, fieldset, [role='radiogroup'], [role='group']") : null;
  if (box && (!headingEl || !box.contains(headingEl))) {
    const own = groupHeading(controls[0]);
    if (own) question = own;
  }
  if (!question || options.length === 0) continue;
  const required = controls.some((control) => control.required) || /[*✱]/.test(question);
  questions.push({ id: `[name="${CSS.escape(name)}"]`, label: question, required, kind: "choice", options });
}
return questions;
