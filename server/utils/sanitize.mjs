/**
 * Sanitizes rich HTML document content against XSS while preserving
 * Microsoft Word-style formatting, tables, colors, and inline images/doodles.
 */
export function sanitizeDocumentHtml(html) {
  if (typeof html !== 'string') return '';

  let cleaned = html
    // Remove dangerous blocks entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<(iframe|object|embed|form|meta|link|base|applet)\b[^>]*>.*?<\/\1>/gis, '')
    .replace(/<(iframe|object|embed|form|meta|link|base|applet)\b[^>]*\/?>/gi, '')
    // Strip inline event handlers (onload, onclick, onerror, etc.)
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Strip srcdoc
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Disallow javascript:, vbscript:, or non-safe data: URIs in href/src
  cleaned = cleaned.replace(
    /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, attr, _raw, dquoted, squoted, unquoted) => {
      const value = (dquoted ?? squoted ?? unquoted ?? '').trim();
      const lower = value.toLowerCase().replace(/[\s\u0000-\u001f]+/g, '');
      if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
        return ` ${attr}="#"`;
      }
      if (attr.toLowerCase() === 'src' && lower.startsWith('data:')) {
        const isSafeImage = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(lower);
        if (!isSafeImage) {
          return ' src=""';
        }
      }
      if (attr.toLowerCase() === 'href' && lower.startsWith('data:')) {
        return ' href="#"';
      }
      return full;
    }
  );

  // Strip CSS expression() / javascript url() inside style attributes
  cleaned = cleaned.replace(/style\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) => {
    const val = (dq ?? sq ?? '')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, '')
      .replace(/"/g, "'");
    return `style="${val}"`;
  });

  return cleaned;
}

export function extractPlainText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countWords(html) {
  const text = extractPlainText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function sanitizeFilename(name, fallback = 'dokumento') {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || fallback;
}
