import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { extractPlainText, sanitizeFilename } from './sanitize.mjs';

function escapeHtmlText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function parseDataUrlImage(src) {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i.exec(String(src || '').trim());
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) return null;
  return { type: ext === 'webp' ? 'png' : ext, buffer };
}

function parsePageDoodle(doc) {
  try {
    const parsed = JSON.parse(doc.page_doodle_json || '{}');
    if (parsed && typeof parsed.dataUrl === 'string' && parsed.dataUrl.startsWith('data:image/')) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractImageWidthRatio(attrs = '') {
  const pctMatch = /width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(attrs);
  if (pctMatch) {
    return Math.max(0.15, Math.min(1, Number(pctMatch[1]) / 100));
  }
  const pxStyleMatch = /width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(attrs);
  if (pxStyleMatch) {
    return Math.max(0.15, Math.min(1, Number(pxStyleMatch[1]) / 688));
  }
  const widthAttrMatch = /\bwidth\s*=\s*["']?(\d+)/i.exec(attrs);
  if (widthAttrMatch) {
    return Math.max(0.15, Math.min(1, Number(widthAttrMatch[1]) / 688));
  }
  return 0.65;
}

/**
 * Lightweight deterministic HTML block parser for DOCX and PDF export.
 */
function parseHtmlBlocks(html) {
  const cleaned = String(html || '')
    .replace(/\r?\n/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n');

  const blocks = [];

  // Extract tables and top-level blocks sequentially
  const blockRe =
    /<(h1|h2|h3|p|blockquote|li|div|table)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*?)\/?>|<hr\b([^>]*?)\/?>/gi;

  let match;
  let lastIndex = 0;

  while ((match = blockRe.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const stray = decodeHtmlEntities(cleaned.slice(lastIndex, match.index).replace(/<[^>]+>/g, '')).trim();
      if (stray) {
        blocks.push({ kind: 'p', runs: [{ text: stray }], align: 'left' });
      }
    }
    lastIndex = blockRe.lastIndex;

    if (match[0].toLowerCase().startsWith('<img')) {
      const attrs = match[4] || '';
      const srcM = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (srcM?.[1]) {
        blocks.push({ kind: 'img', src: srcM[1], widthRatio: extractImageWidthRatio(attrs) });
      }
      continue;
    }

    if (match[0].toLowerCase().startsWith('<hr')) {
      const hrAttrs = match[5] || '';
      const isPageBreak =
        /page-break/i.test(hrAttrs) || /data-page-break/i.test(hrAttrs);
      blocks.push({ kind: isPageBreak ? 'page_break' : 'hr' });
      continue;
    }

    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const inner = match[3] || '';

    if (tag === 'table') {
      const rows = [];
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rm;
      while ((rm = rowRe.exec(inner)) !== null) {
        const cells = [];
        const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
        let cm;
        while ((cm = cellRe.exec(rm[1])) !== null) {
          const text = decodeHtmlEntities(cm[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
          cells.push({ isHeader: cm[1].toLowerCase() === 'th', text });
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        blocks.push({ kind: 'table', rows });
      }
      continue;
    }

    // Check for inline images inside paragraphs/divs
    const imgInBlockRe = /<img\b([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*?)>/gi;
    let imgMatch;
    const inlineImages = [];
    while ((imgMatch = imgInBlockRe.exec(inner)) !== null) {
      const allAttrs = `${imgMatch[1] || ''} ${imgMatch[3] || ''}`;
      inlineImages.push({ src: imgMatch[2], widthRatio: extractImageWidthRatio(allAttrs) });
    }

    const alignMatch = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs);
    const align = alignMatch ? alignMatch[1].toLowerCase() : 'left';

    const runs = parseInlineRuns(inner);
    if (runs.length > 0) {
      blocks.push({ kind: tag, runs, align });
    }
    for (const imgObj of inlineImages) {
      blocks.push({ kind: 'img', src: imgObj.src, widthRatio: imgObj.widthRatio });
    }
  }

  if (lastIndex < cleaned.length) {
    const tail = decodeHtmlEntities(cleaned.slice(lastIndex).replace(/<[^>]+>/g, '')).trim();
    if (tail) {
      blocks.push({ kind: 'p', runs: [{ text: tail }], align: 'left' });
    }
  }

  return blocks;
}

function parseInlineRuns(innerHtml) {
  const runs = [];
  // Tokenize tags vs text
  const tokenRe = /(<\/?(?:b|strong|i|em|u|s|strike|span|font|a)\b[^>]*>)|([^<]+)/gi;
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let m;

  while ((m = tokenRe.exec(innerHtml)) !== null) {
    if (m[1]) {
      const tagStr = m[1].toLowerCase();
      const closing = tagStr.startsWith('</');
      if (/^<\/?(b|strong)\b/.test(tagStr)) bold = !closing;
      else if (/^<\/?(i|em)\b/.test(tagStr)) italic = !closing;
      else if (/^<\/?u\b/.test(tagStr)) underline = !closing;
      else if (/^<\/?(s|strike)\b/.test(tagStr)) strike = !closing;
    } else if (m[2]) {
      const text = decodeHtmlEntities(m[2]);
      if (text.trim() || text.includes(' ')) {
        runs.push({ text, bold, italic, underline, strike });
      }
    }
  }
  return runs;
}

export async function buildDocxBuffer(doc) {
  let pageSettings = { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' };
  try {
    pageSettings = { ...pageSettings, ...JSON.parse(doc.page_settings_json || '{}') };
  } catch {
    // defaults
  }

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: doc.title || 'Walang Pamagat na Dokumento',
          bold: true,
          color: '1E3A8A',
        }),
      ],
    }),
  ];

  const blocks = parseHtmlBlocks(doc.content_html || '');
  const alignMap = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };

  for (const block of blocks) {
    if (block.kind === 'page_break') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }

    if (block.kind === 'hr') {
      children.push(
        new Paragraph({
          border: {
            bottom: { color: 'BFDBFE', space: 1, style: BorderStyle.SINGLE, size: 8 },
          },
          children: [],
        })
      );
      continue;
    }

    if (block.kind === 'img') {
      const parsedImg = parseDataUrlImage(block.src);
      if (parsedImg && (parsedImg.type === 'png' || parsedImg.type === 'jpg' || parsedImg.type === 'gif')) {
        const targetW = Math.round(520 * (block.widthRatio || 0.65));
        const targetH = Math.round(targetW * 0.56);
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: parsedImg.type,
                data: parsedImg.buffer,
                transformation: { width: targetW, height: targetH },
              }),
            ],
          })
        );
      }
      continue;
    }

    if (block.kind === 'table') {
      const tableRows = block.rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell) =>
                new TableCell({
                  width: { size: Math.floor(100 / r.length), type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cell.text || ' ',
                          bold: cell.isHeader,
                          color: cell.isHeader ? '1E3A8A' : '0F172A',
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows,
        })
      );
      continue;
    }

    const heading =
      block.kind === 'h1'
        ? HeadingLevel.HEADING_1
        : block.kind === 'h2'
          ? HeadingLevel.HEADING_2
          : block.kind === 'h3'
            ? HeadingLevel.HEADING_3
            : undefined;

    const textRuns = block.runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: Boolean(r.bold),
          italics: Boolean(r.italic),
          underline: r.underline ? {} : undefined,
          strike: Boolean(r.strike),
        })
    );

    children.push(
      new Paragraph({
        heading,
        bullet: block.kind === 'li' ? { level: 0 } : undefined,
        alignment: alignMap[block.align] || AlignmentType.LEFT,
        indent: block.kind === 'blockquote' ? { left: 480 } : undefined,
        children: textRuns,
      })
    );
  }

  const pageDoodle = parsePageDoodle(doc);
  if (pageDoodle) {
    const parsedOverlay = parseDataUrlImage(pageDoodle.dataUrl);
    if (parsedOverlay && parsedOverlay.type === 'png') {
      children.push(
        new Paragraph({
          spacing: { before: 240 },
          children: [
            new TextRun({
              text: 'Guhit sa Pahina (Doodle Layer):',
              bold: true,
              color: '1D4ED8',
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: 'png',
              data: parsedOverlay.buffer,
              transformation: { width: 480, height: 340 },
            }),
          ],
        })
      );
    }
  }

  const marginTwips =
    pageSettings.margins === 'narrow' ? 720 : pageSettings.margins === 'wide' ? 1800 : 1440;

  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(wordDoc);
}

export function buildPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    let pageSettings = { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' };
    try {
      pageSettings = { ...pageSettings, ...JSON.parse(doc.page_settings_json || '{}') };
    } catch {
      // defaults
    }

    const marginPts =
      pageSettings.margins === 'narrow' ? 36 : pageSettings.margins === 'wide' ? 90 : 60;

    const pdf = new PDFDocument({
      size: 'LETTER',
      layout: pageSettings.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: marginPts,
      info: {
        Title: doc.title || 'Tintalata Dokumento',
        Creator: 'Tintalata',
      },
    });

    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Title Header
    pdf
      .fillColor('#1e3a8a')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(doc.title || 'Walang Pamagat na Dokumento', { align: 'left' });

    pdf
      .moveTo(marginPts, pdf.y + 4)
      .lineTo(pdf.page.width - marginPts, pdf.y + 4)
      .strokeColor('#bfdbfe')
      .lineWidth(1.5)
      .stroke();
    pdf.moveDown(0.8);

    const blocks = parseHtmlBlocks(doc.content_html || '');
    for (const block of blocks) {
      if (block.kind === 'page_break') {
        pdf.addPage();
        continue;
      }

      if (block.kind === 'hr') {
        pdf
          .moveTo(marginPts, pdf.y + 4)
          .lineTo(pdf.page.width - marginPts, pdf.y + 4)
          .strokeColor('#cbd5e1')
          .lineWidth(1)
          .stroke();
        pdf.moveDown(0.6);
        continue;
      }

      if (block.kind === 'img') {
        const parsedImg = parseDataUrlImage(block.src);
        if (parsedImg && (parsedImg.type === 'png' || parsedImg.type === 'jpg')) {
          try {
            if (pdf.y > pdf.page.height - 220) pdf.addPage();
            const usableW = (pdf.page.width - marginPts * 2) * (block.widthRatio || 0.65);
            pdf.image(parsedImg.buffer, {
              fit: [Math.max(90, usableW), 320],
              align: 'center',
            });
            pdf.moveDown(0.6);
          } catch {
            // ignore unsupported image decode
          }
        }
        continue;
      }

      if (block.kind === 'table') {
        pdf.font('Helvetica').fontSize(10).fillColor('#0f172a');
        for (const r of block.rows) {
          const line = r.map((c) => c.text || '—').join('   |   ');
          pdf.text(line);
        }
        pdf.moveDown(0.5);
        continue;
      }

      const plain = block.runs.map((r) => r.text).join('');
      if (!plain.trim()) continue;

      if (block.kind === 'h1') {
        pdf.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(16).text(plain);
      } else if (block.kind === 'h2') {
        pdf.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(13.5).text(plain);
      } else if (block.kind === 'h3') {
        pdf.fillColor('#1e40af').font('Helvetica-Bold').fontSize(12).text(plain);
      } else if (block.kind === 'blockquote') {
        pdf
          .fillColor('#334155')
          .font('Helvetica-Oblique')
          .fontSize(11)
          .text(`“${plain}”`, { indent: 16 });
      } else if (block.kind === 'li') {
        pdf.fillColor('#0f172a').font('Helvetica').fontSize(11).text(`•  ${plain}`, {
          indent: 14,
        });
      } else {
        const alignOption = ['left', 'center', 'right', 'justify'].includes(block.align)
          ? block.align
          : 'left';
        const hasBold = block.runs.every((r) => r.bold);
        const hasItalic = block.runs.every((r) => r.italic);
        const fontName = hasBold
          ? 'Helvetica-Bold'
          : hasItalic
            ? 'Helvetica-Oblique'
            : 'Helvetica';
        pdf.fillColor('#0f172a').font(fontName).fontSize(11).text(plain, {
          align: alignOption,
          lineGap: 3,
        });
      }
      pdf.moveDown(0.35);
    }

    const pageDoodle = parsePageDoodle(doc);
    if (pageDoodle) {
      const parsedOverlay = parseDataUrlImage(pageDoodle.dataUrl);
      if (parsedOverlay && parsedOverlay.type === 'png') {
        try {
          if (pdf.y > pdf.page.height - 260) pdf.addPage();
          pdf.moveDown(0.5);
          pdf.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(11).text('Guhit sa Pahina:');
          pdf.moveDown(0.25);
          pdf.image(parsedOverlay.buffer, {
            fit: [pdf.page.width - marginPts * 2, 260],
            align: 'center',
          });
        } catch {
          // ignore
        }
      }
    }

    pdf.end();
  });
}

export function buildWordDocHtml(doc) {
  let pageSettings = { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' };
  try {
    pageSettings = { ...pageSettings, ...JSON.parse(doc.page_settings_json || '{}') };
  } catch {
    // use defaults
  }

  const safeTitle = escapeHtmlText(doc.title || 'Walang Pamagat na Dokumento');
  const marginValue =
    pageSettings.margins === 'narrow'
      ? '0.5in'
      : pageSettings.margins === 'wide'
        ? '1.25in'
        : '1in';
  const pageDoodle = parsePageDoodle(doc);
  const doodleHtml = pageDoodle
    ? `<div style="margin-top:16px;"><p><strong>Guhit sa Pahina:</strong></p><img src="${pageDoodle.dataUrl}" alt="Guhit sa Pahina" /></div>`
    : '';

  return `\ufeff<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40"
      lang="tl">
<head>
<meta charset="UTF-8" />
<title>${safeTitle}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page {
    size: ${pageSettings.orientation === 'landscape' ? 'landscape' : 'portrait'};
    margin: ${marginValue};
  }
  body {
    font-family: Calibri, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #0f172a;
    background-color: ${escapeHtmlText(pageSettings.pageColor || '#ffffff')};
  }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  td, th { border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 4px solid #2563eb; margin: 12px 0; padding-left: 12px; color: #334155; }
  hr.page-break { border: none; page-break-after: always; break-after: page; height: 0; margin: 0; }
</style>
</head>
<body>
${doc.content_html || '<p></p>'}
${doodleHtml}
</body>
</html>`;
}

export function buildStandaloneHtml(doc) {
  const safeTitle = escapeHtmlText(doc.title || 'Walang Pamagat na Dokumento');
  const pageDoodle = parsePageDoodle(doc);
  const doodleHtml = pageDoodle
    ? `<div style="margin-top:20px;"><p><strong>Guhit sa Pahina:</strong></p><img src="${pageDoodle.dataUrl}" alt="Guhit sa Pahina" /></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="tl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<style>
  body { font-family: 'Inter', Arial, sans-serif; background: #eff6ff; margin: 0; padding: 32px 16px; color: #0f172a; }
  .page { max-width: 816px; margin: 0 auto; background: #ffffff; padding: 64px; border-radius: 12px; box-shadow: 0 10px 30px rgba(30,64,175,0.08); border: 1px solid #dbeafe; }
  h1.doc-title { margin-top: 0; color: #1e40af; border-bottom: 2px solid #dbeafe; padding-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  td, th { border: 1px solid #cbd5e1; padding: 8px 10px; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 4px solid #2563eb; margin: 12px 0; padding: 8px 14px; background: #f8fafc; }
  hr.page-break { border: none; border-top: 2px dashed #93c5fd; margin: 28px 0; page-break-after: always; break-after: page; }
</style>
</head>
<body>
  <article class="page">
    <h1 class="doc-title">${safeTitle}</h1>
    ${doc.content_html || '<p></p>'}
    ${doodleHtml}
  </article>
</body>
</html>`;
}

export async function buildDocumentExport(doc, format = 'docx') {
  const baseName = sanitizeFilename(doc.title, 'dokumento');
  const normalized = String(format || 'docx').toLowerCase();

  if (normalized === 'docx') {
    const buffer = await buildDocxBuffer(doc);
    return {
      filename: `${baseName}.docx`,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    };
  }

  if (normalized === 'pdf') {
    const buffer = await buildPdfBuffer(doc);
    return {
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
      buffer,
    };
  }

  if (normalized === 'txt') {
    return {
      filename: `${baseName}.txt`,
      contentType: 'text/plain; charset=utf-8',
      buffer: Buffer.from(
        `${doc.title}\n${'='.repeat(Math.min(60, (doc.title || '').length || 10))}\n\n${extractPlainText(doc.content_html)}`,
        'utf8'
      ),
    };
  }

  if (normalized === 'html') {
    return {
      filename: `${baseName}.html`,
      contentType: 'text/html; charset=utf-8',
      buffer: Buffer.from(buildStandaloneHtml(doc), 'utf8'),
    };
  }

  return {
    filename: `${baseName}.doc`,
    contentType: 'application/msword; charset=utf-8',
    buffer: Buffer.from(buildWordDocHtml(doc), 'utf8'),
  };
}

export async function buildFolderZipBuffer(rootFolder, allFolders, allDocs, format = 'docx') {
  const zip = new JSZip();
  const rootName = sanitizeFilename(rootFolder.name, 'folder');
  const rootZip = zip.folder(rootName);

  const foldersByParent = new Map();
  for (const f of allFolders) {
    if (f.is_deleted) continue;
    const key = f.parent_id || '__root__';
    if (!foldersByParent.has(key)) foldersByParent.set(key, []);
    foldersByParent.get(key).push(f);
  }

  const docsByFolder = new Map();
  for (const d of allDocs) {
    if (d.is_deleted) continue;
    const key = d.folder_id || '__root__';
    if (!docsByFolder.has(key)) docsByFolder.set(key, []);
    docsByFolder.get(key).push(d);
  }

  let fileCount = 0;

  async function addFolderContents(folderId, targetZipFolder) {
    const docs = docsByFolder.get(folderId) || [];
    const usedNames = new Set();
    for (const doc of docs) {
      const exported = await buildDocumentExport(doc, format);
      let finalName = exported.filename;
      if (usedNames.has(finalName.toLowerCase())) {
        const dotIdx = finalName.lastIndexOf('.');
        const stem = dotIdx > 0 ? finalName.slice(0, dotIdx) : finalName;
        const ext = dotIdx > 0 ? finalName.slice(dotIdx) : '';
        let counter = 2;
        while (usedNames.has(`${stem} (${counter})${ext}`.toLowerCase())) {
          counter += 1;
        }
        finalName = `${stem} (${counter})${ext}`;
      }
      usedNames.add(finalName.toLowerCase());
      targetZipFolder.file(finalName, exported.buffer);
      fileCount += 1;
    }

    const subfolders = foldersByParent.get(folderId) || [];
    const usedFolderNames = new Set();
    for (const sub of subfolders) {
      let subName = sanitizeFilename(sub.name, 'subfolder');
      if (usedFolderNames.has(subName.toLowerCase())) {
        let counter = 2;
        while (usedFolderNames.has(`${subName} (${counter})`.toLowerCase())) {
          counter += 1;
        }
        subName = `${subName} (${counter})`;
      }
      usedFolderNames.add(subName.toLowerCase());
      const subZip = targetZipFolder.folder(subName);
      await addFolderContents(sub.id, subZip);
    }
  }

  await addFolderContents(rootFolder.id, rootZip);

  if (fileCount === 0) {
    rootZip.file(
      'Impormasyon.txt',
      `Ang folder na "${rootFolder.name}" ay kasalukuyang walang laman na dokumento.\nNa-download mula sa Tintalata.\n`
    );
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    filename: `${rootName}.zip`,
    buffer,
  };
}
