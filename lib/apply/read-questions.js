const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const form = document.querySelector("form") || document.body;
const questions = [];
const used = new Set();

const selectorFor = (control) => {
  if (control.id) return `#${CSS.escape(control.id)}`;
  const name = control.getAttribute("name");
  return name ? `[name="${CSS.escape(name)}"]` : "";
};

for (const label of form.querySelectorAll("label")) {
  const text = clean(label.textContent);
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
  let node = controls[0] ? controls[0].parentElement : null;
  for (let depth = 0; depth < 8 && node && !question; depth += 1) {
    const labels = [...node.querySelectorAll("label")];
    const heading = labels.find((label) => {
      const targetId = label.getAttribute("for");
      const target = targetId ? document.getElementById(targetId) : null;
      const targetType = target ? target.getAttribute("type") : null;
      return !target || (targetType !== "radio" && targetType !== "checkbox");
    });
    question = clean(heading ? heading.textContent : "");
    node = node.parentElement;
  }
  if (!question || options.length === 0) continue;
  const required = controls.some((control) => control.required) || /[*✱]/.test(question);
  questions.push({ id: `[name="${CSS.escape(name)}"]`, label: question, required, kind: "choice", options });
}
return questions;
