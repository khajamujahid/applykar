export async function extractResumeText(filename: string, bytes: Uint8Array): Promise<string> {
  const name = filename.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return new TextDecoder().decode(bytes).trim();
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value.trim();
  }
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = extracted.text;
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }
  throw new Error("Upload a PDF, DOCX, TXT, or Markdown resume.");
}
