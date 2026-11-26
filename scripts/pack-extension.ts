import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const directory = resolve(process.cwd(), "extension");
const zip = resolve(directory, "applykar-extension.zip");
execFileSync("zip", ["-r", "-FS", zip, "manifest.json", "page-logic.js", "content.js", "background.js", "popup.html", "popup.js", "popup.css", "button.css"], {
  cwd: directory,
  stdio: "inherit",
});
console.log(zip);
