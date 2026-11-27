/**
 * Renders a resume as HTML that matches Tsenta's PDF layout exactly (measured from a Tsenta PDF):
 * US Letter, 0.25in top/bottom and 0.5in side margins, Arial (Liberation Sans in Chromium on Linux), black only.
 * Name 17pt bold centred; headline 9pt centred; contact 7.5pt centred, " | " separated, links underlined;
 * section headings 9.5pt bold caps with a 0.75pt rule; body 9pt, 9.75pt leading; bullets "•" 14pt bold with an
 * 11.9pt hanging indent; dates right-aligned. Order: Summary, Education, Skills, Work Experience, Projects,
 * Certifications & Achievements.
 */
import type { ResumeData } from "@/lib/resume/types";

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function bare(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function phone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value;
}

function dates(start?: string, end?: string): string {
  if (!start && !end) return "";
  if (!start) return esc(end ?? "");
  return `${esc(start)} - ${esc(end || "Present")}`;
}

export type RenderOptions = { highlight?: string[]; screen?: boolean };

function highlighter(words: string[] | undefined): (html: string) => string {
  const list = (words ?? []).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
  if (!list.length) return (html) => html;
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(${list.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9])`,
    "gi",
  );
  return (html) => html.replace(pattern, "<mark>$1</mark>");
}

export function renderResumeHtml(resume: ResumeData, options: RenderOptions = {}): string {
  const mark = highlighter(options.highlight);
  const text = (value: string) => mark(esc(value));
  const p = resume.personalInformation;
  const hidden = new Set((resume.hiddenSections ?? []).map((s) => s.toLowerCase()));
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const location = [p.city, p.state, p.country].filter(Boolean).join(", ");
  const contact: string[] = [];
  if (location) contact.push(esc(location));
  if (p.email) contact.push(`<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
  if (p.phone) contact.push(`<a href="tel:${esc(p.phone)}">${esc(phone(p.phone))}</a>`);
  for (const url of [p.githubUrl, p.linkedinUrl, p.website]) if (url) contact.push(`<a href="${esc(url)}">${esc(bare(url))}</a>`);

  const sections: string[] = [];
  const summary = (p.summary ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (summary.length && !hidden.has("summary"))
    sections.push(section("Professional Summary", summary.map((line) => `<p class="item">${text(line)}</p>`).join("")));
  if (resume.education.length && !hidden.has("education"))
    sections.push(
      section(
        "Education",
        resume.education
          .map(
            (e) =>
              `<div class="entry"><div class="row"><b>${esc(e.university)}</b><span>${dates(e.startDate, e.endDate)}</span></div>` +
              `<div>${esc(e.degree)}${e.major ? `, <i>${esc(e.major)}</i>` : ""}</div></div>`,
          )
          .join(""),
      ),
    );
  if (resume.skillCategories.length && !hidden.has("skills"))
    sections.push(
      section(
        "Skills",
        [...resume.skillCategories]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((c) => `<p class="skill"><b>${esc(c.name)}:</b> ${text(c.skills.join(", "))}</p>`)
          .join(""),
      ),
    );
  if (resume.workExperience.length && !hidden.has("experience"))
    sections.push(
      section(
        "Work Experience",
        resume.workExperience
          .map(
            (w) =>
              `<div class="entry"><div class="row"><span><b>${esc(w.company)} |</b> ${esc(w.role)}</span><span>${dates(w.startDate, w.endDate)}</span></div>` +
              bullets(w.responsibilities, text) +
              `</div>`,
          )
          .join(""),
      ),
    );
  if (resume.projects.length && !hidden.has("projects"))
    sections.push(
      section(
        "Projects",
        resume.projects
          .map((pr) => {
            const link = pr.githubUrl || pr.liveUrl;
            const title = pr.liveUrl ? `<a href="${esc(pr.liveUrl)}"><b>${esc(pr.title)}</b></a>` : `<b>${esc(pr.title)}</b>`;
            const head = link ? `<span>${title} | <a href="${esc(link)}">${esc(bare(link))}</a></span>` : `<span>${title}</span>`;
            return `<div class="entry"><div class="row">${head}<span>${dates(pr.startDate, pr.endDate)}</span></div>${bullets(pr.details, text)}</div>`;
          })
          .join(""),
      ),
    );
  if (resume.certifications.length && !hidden.has("certifications"))
    sections.push(
      section(
        "Certifications & Achievements",
        bullets(
          resume.certifications.map((c) => (c.issuingOrganization ? `${c.name} - ${c.issuingOrganization}` : c.name)),
          esc,
        ),
      ),
    );

  return `<!doctype html><html><head><meta charset="utf-8"><title>Resume - ${esc(name)}</title><style>${CSS}${
    options.screen ? SCREEN_CSS : ""
  }</style></head><body><main class="page">
<header><h1>${esc(name)}</h1>${p.title ? `<div class="headline">${esc(p.title)}</div>` : ""}<div class="contact">${contact
    .map((item, i) => `<span class="ci">${item}${i < contact.length - 1 ? '<span class="sep"> |</span>' : ""}</span>`)
    .join(" ")}</div></header>
${sections.join("\n")}
</main></body></html>`;
}

function section(title: string, body: string): string {
  return `<section class="${title === "Education" ? "edu" : ""}"><h2>${esc(title.toUpperCase())}</h2>${body}</section>`;
}

function bullets(items: string[], text: (value: string) => string): string {
  const list = items.map((item) => item.trim()).filter(Boolean);
  return list.length ? `<ul>${list.map((item) => `<li>${text(item)}</li>`).join("")}</ul>` : "";
}

const CSS = `
@page { size: Letter; margin: 0.25in 0.5in; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 9pt; line-height: 9.89pt; color: #000; background: #fff; }
a { color: #000; text-decoration: underline; text-decoration-thickness: 0.75pt; text-underline-offset: 1.5pt; }
header { text-align: center; margin-bottom: -1.8pt; }
h1 { font-size: 17pt; line-height: 12.4pt; font-weight: 700; margin-bottom: 9.5pt; }
.headline { font-size: 9pt; line-height: 11pt; margin-bottom: 3.9pt; }
.contact { font-size: 7.5pt; line-height: 12pt; padding: 0 70pt; }
.contact .ci { white-space: nowrap; }
section { margin-top: 6.25pt; }
h2 { font-size: 9.5pt; line-height: 11pt; font-weight: 700; padding-bottom: 3.6pt; border-bottom: 0.75pt solid #000; margin-bottom: 5.9pt; }
section.edu .entry:first-of-type { margin-top: -1.6pt; }
p.skill { margin-bottom: 2.05pt; }
.entry { margin-bottom: 0; }
.entry + .entry { margin-top: 2.1pt; }
.entry ul { margin-top: 2.1pt; }
.row { display: flex; justify-content: space-between; gap: 12pt; }
.row > span:last-child { white-space: nowrap; }
ul { list-style: none; }
li { position: relative; padding-left: 11.9pt; }
li::before { content: "\\2022"; position: absolute; left: 0; top: -1.1pt; font-size: 14pt; font-weight: 700; line-height: 12pt; }
mark { background: transparent; color: inherit; }
`;

/** In-app preview: page-like card and visible keyword highlights. */
const SCREEN_CSS = `
body { background: transparent; }
.page { width: 8.5in; min-height: 11in; padding: 0.25in 0.5in; margin: 0 auto; background: #fff; }
mark { background: #ede9fe; color: #3b1fa8; border-radius: 2px; padding: 0 1px; }
`;
