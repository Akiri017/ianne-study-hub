/**
 * Reviewer document generation — DOCX and PDF output.
 *
 * Converts Markdown reviewer content to downloadable study documents.
 * Full Markdown fidelity isn't needed — headings, paragraphs, and bold
 * text are sufficient for a clean, readable reviewer.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Shared Markdown parser
// ---------------------------------------------------------------------------

type BlockType = 'h1' | 'h2' | 'h3' | 'paragraph' | 'bullet'

interface ParsedBlock {
  type: BlockType
  text: string
}

/**
 * Parses a Markdown string into a flat list of typed blocks.
 * Handles headings (#, ##, ###), bullet points (-, *), and paragraphs.
 * Strips unrecognised syntax rather than rendering it literally.
 */
function parseMarkdown(markdown: string): ParsedBlock[] {
  const lines = markdown.split('\n')
  const blocks: ParsedBlock[] = []

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
    } else if (line.match(/^[-*]\s+/)) {
      blocks.push({ type: 'bullet', text: line.replace(/^[-*]\s+/, '').trim() })
    } else if (line.trim().length > 0) {
      blocks.push({ type: 'paragraph', text: line.trim() })
    }
    // Empty lines are intentionally skipped — spacing is handled per-format
  }

  return blocks
}

/**
 * Extracts inline bold segments from a string.
 * Returns an array of { text, bold } tuples for use in run-based renderers.
 */
function parseInlineBold(text: string): Array<{ text: string; bold: boolean }> {
  const segments: Array<{ text: string; bold: boolean }> = []
  // Split on **...** markers — odd indices are bold content
  const parts = text.split(/\*\*(.+?)\*\*/)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) {
      segments.push({ text: parts[i], bold: i % 2 === 1 })
    }
  }
  return segments
}

// ---------------------------------------------------------------------------
// DOCX builder
// ---------------------------------------------------------------------------

const HEADING_MAP: Record<'h1' | 'h2' | 'h3', typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
}

/**
 * Builds a DOCX reviewer document from a title and Markdown content.
 * Returns the raw buffer — caller sets Content-Disposition and sends it.
 */
export async function buildReviewerDocx(title: string, markdownContent: string): Promise<Buffer> {
  const blocks = parseMarkdown(markdownContent)

  const docParagraphs: Paragraph[] = [
    // Document title
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ]

  for (const block of blocks) {
    if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      docParagraphs.push(
        new Paragraph({
          text: block.text,
          heading: HEADING_MAP[block.type],
          spacing: { before: 240, after: 120 },
        })
      )
    } else if (block.type === 'bullet') {
      const runs = parseInlineBold(block.text).map(
        (seg) => new TextRun({ text: seg.text, bold: seg.bold })
      )
      docParagraphs.push(
        new Paragraph({
          children: runs,
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      )
    } else {
      // paragraph
      const runs = parseInlineBold(block.text).map(
        (seg) => new TextRun({ text: seg.text, bold: seg.bold })
      )
      docParagraphs.push(
        new Paragraph({
          children: runs,
          spacing: { after: 160 },
        })
      )
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docParagraphs,
      },
    ],
  })

  return Packer.toBuffer(doc)
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

const PDF_STYLES = {
  h1: { fontSize: 20, bold: true, spaceBefore: 18, spaceAfter: 8 },
  h2: { fontSize: 16, bold: true, spaceBefore: 14, spaceAfter: 6 },
  h3: { fontSize: 13, bold: true, spaceBefore: 10, spaceAfter: 4 },
  paragraph: { fontSize: 11, bold: false, spaceBefore: 0, spaceAfter: 6 },
  bullet: { fontSize: 11, bold: false, spaceBefore: 0, spaceAfter: 4 },
}

/**
 * Builds a PDF reviewer document from a title and Markdown content.
 * Returns the raw buffer synchronously via PDFDocument.
 */
export function buildReviewerPdf(title: string, markdownContent: string): Buffer {
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ margin: 60, size: 'A4' })

  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  // Title
  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .text(title, { align: 'center' })
    .moveDown(1.5)

  const blocks = parseMarkdown(markdownContent)

  for (const block of blocks) {
    const style = PDF_STYLES[block.type]

    if (style.spaceBefore > 0) {
      doc.moveDown(style.spaceBefore / 14) // convert pt to rough line units
    }

    if (block.type === 'bullet') {
      // Render bullet inline using pdfkit's list capability
      doc
        .fontSize(style.fontSize)
        .font('Helvetica')
        .list([stripMarkdownInline(block.text)], { bulletRadius: 2, textIndent: 10 })
    } else if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      doc
        .fontSize(style.fontSize)
        .font('Helvetica-Bold')
        .text(block.text)
    } else {
      // paragraph — render inline bold segments manually
      const segments = parseInlineBold(block.text)
      let isFirstSegment = true

      for (const seg of segments) {
        const font = seg.bold ? 'Helvetica-Bold' : 'Helvetica'
        doc.fontSize(style.fontSize).font(font)
        // continued: true keeps all segments on the same line/block
        if (isFirstSegment) {
          doc.text(seg.text, { continued: segments.length > 1 && !isLastSegment(segments, seg) })
          isFirstSegment = false
        } else {
          doc.text(seg.text, { continued: !isLastSegment(segments, seg) })
        }
      }
    }

    if (style.spaceAfter > 0) {
      doc.moveDown(style.spaceAfter / 14)
    }
  }

  doc.end()

  return Buffer.concat(chunks)
}

/** Strips **bold** markers for contexts where inline formatting is not rendered. */
function stripMarkdownInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}

function isLastSegment(
  segments: Array<{ text: string; bold: boolean }>,
  seg: { text: string; bold: boolean }
): boolean {
  return segments[segments.length - 1] === seg
}
