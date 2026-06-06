"use client"

// Use the legacy build to avoid the Node-only `canvas` dependency
// pulled in by the default ES build of pdfjs-dist.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf"

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"
}

export { pdfjsLib }
