import JSZip from 'jszip';
import { extractPlainText, sanitizeFilename } from './sanitize.mjs';

function escapeHtmlText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
</style>
</head>
<body>
${doc.content_html || '<p></p>'}
</body>
</html>`;
}

export function buildStandaloneHtml(doc) {
  const safeTitle = escapeHtmlText(doc.title || 'Walang Pamagat na Dokumento');
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
</style>
</head>
<body>
  <article class="page">
    <h1 class="doc-title">${safeTitle}</h1>
    ${doc.content_html || '<p></p>'}
  </article>
</body>
</html>`;
}

export function buildDocumentExport(doc, format = 'doc') {
  const baseName = sanitizeFilename(doc.title, 'dokumento');
  const normalized = String(format || 'doc').toLowerCase();

  if (normalized === 'txt') {
    return {
      filename: `${baseName}.txt`,
      contentType: 'text/plain; charset=utf-8',
      buffer: Buffer.from(`${doc.title}\n${'='.repeat(Math.min(60, (doc.title || '').length || 10))}\n\n${extractPlainText(doc.content_html)}`, 'utf8'),
    };
  }
  if (normalized === 'html') {
    return {
      filename: `${baseName}.html`,
      contentType: 'text/html; charset=utf-8',
      buffer: Buffer.from(buildStandaloneHtml(doc), 'utf8'),
    };
  }
  // Default: Microsoft Word compatible .doc
  return {
    filename: `${baseName}.doc`,
    contentType: 'application/msword; charset=utf-8',
    buffer: Buffer.from(buildWordDocHtml(doc), 'utf8'),
  };
}

export async function buildFolderZipBuffer(rootFolder, allFolders, allDocs, format = 'doc') {
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

  function addFolderContents(folderId, targetZipFolder) {
    const docs = docsByFolder.get(folderId) || [];
    const usedNames = new Set();
    for (const doc of docs) {
      const exported = buildDocumentExport(doc, format);
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
      addFolderContents(sub.id, subZip);
    }
  }

  addFolderContents(rootFolder.id, rootZip);

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
