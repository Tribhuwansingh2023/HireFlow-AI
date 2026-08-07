/**
 * Browser-side resume text extraction.
 * PDF (text layer) → DOCX → OCR fallback for scanned documents.
 * Runs client-side so large files never traverse the server.
 */

export type ExtractionResult = {
  text: string;
  ocrUsed: boolean;
  pages: number;
};

export type ExtractProgress = (stage: string, pct?: number) => void;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  return pdfjs;
}

async function extractPdf(file: File, onProgress: ExtractProgress): Promise<ExtractionResult> {
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress(`Reading page ${i} of ${doc.numPages}`, Math.round((i / doc.numPages) * 55));
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n\n";
  }

  if (text.replace(/\s/g, "").length > 120) {
    return { text: text.trim(), ocrUsed: false, pages: doc.numPages };
  }

  // Scanned document — fall back to OCR.
  onProgress("No text layer found — running OCR", 60);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  let ocrText = "";
  const maxPages = Math.min(doc.numPages, 8);
  for (let i = 1; i <= maxPages; i++) {
    onProgress(`OCR page ${i} of ${maxPages}`, 60 + Math.round((i / maxPages) * 35));
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
    const { data } = await worker.recognize(canvas);
    ocrText += data.text + "\n\n";
  }
  await worker.terminate();
  return { text: ocrText.trim(), ocrUsed: true, pages: doc.numPages };
}

async function extractDocx(file: File, onProgress: ExtractProgress): Promise<ExtractionResult> {
  onProgress("Reading document", 40);
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await (mammoth as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> })
    .extractRawText({ arrayBuffer });
  return { text: result.value.trim(), ocrUsed: false, pages: 1 };
}

async function extractImage(file: File, onProgress: ExtractProgress): Promise<ExtractionResult> {
  onProgress("Running OCR on image", 45);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const { data } = await worker.recognize(file);
  await worker.terminate();
  return { text: data.text.trim(), ocrUsed: true, pages: 1 };
}

export async function extractResumeText(
  file: File,
  onProgress: ExtractProgress = () => {},
): Promise<ExtractionResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file, onProgress);
  if (name.endsWith(".docx")) return extractDocx(file, onProgress);
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: (await file.text()).trim(), ocrUsed: false, pages: 1 };
  }
  if (/\.(png|jpe?g|webp)$/.test(name)) return extractImage(file, onProgress);
  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT or a scanned image.");
}

export const ACCEPTED_RESUME_TYPES = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";
