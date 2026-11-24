/**
 * Reads plain text from an uploaded CV in the browser so it can be analysed (guide §12).
 * DOCX is a zip of XML (read with JSZip); PDF text is read with PDF.js. Scanned PDFs have no
 * text layer: extraction then returns null and HR can flag the issue or paste the text.
 *
 * In production the backend stores the original file and extracts text server-side; the AI
 * service only ever receives text.
 */

export const MAX_CV_TEXT = 60_000;

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** word/document.xml → text, one line per paragraph. */
export function docxXmlToText(xml: string) {
  return decodeXml(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function readDocx(data: ArrayBuffer) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("word/document.xml")?.async("string");
  return xml ? docxXmlToText(xml) : "";
}

async function readPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: string[] = [];
  for (let page = 1; page <= Math.min(pdf.numPages, 20); page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    let line = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trim());
        line = "";
      } else {
        line += " ";
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.filter(Boolean).join("\n");
}

/** Text of a PDF or DOCX CV, or null when nothing readable was found. */
export async function extractCvText(file: File): Promise<string | null> {
  try {
    const data = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const text = name.endsWith(".docx") ? await readDocx(data) : name.endsWith(".pdf") ? await readPdf(data) : "";
    const clean = text.replace(/[ \t]+\n/g, "\n").trim();
    return clean.length >= 50 ? clean.slice(0, MAX_CV_TEXT) : null;
  } catch {
    return null;
  }
}

/* ── original files (this browser session only) ─────────────────────────── */

const originals = new Map<string, Blob>();

/** Keeps the uploaded file so HR can download it in this session (the backend stores it for real). */
export function rememberCvFile(applicationId: string, file: Blob) {
  originals.set(applicationId, file);
}

export function cvFileFor(applicationId: string) {
  return originals.get(applicationId) ?? null;
}
