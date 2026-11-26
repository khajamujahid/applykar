import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const directory = resolve(process.cwd(), "extension");
const zip = resolve(process.cwd(), "public", "applykar-extension.zip");
const files = ["manifest.json", "page-logic.js", "content.js", "background.js", "popup.html", "popup.js", "popup.css", "button.css"];
execFileSync(
  "python3",
  ["-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)\nfor f in sys.argv[2:]: z.write(f)\nz.close()", zip, ...files],
  { cwd: directory, stdio: "inherit" },
);
console.log(zip);
