import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { hashPassword } from './crypto.mjs';
import { calculateDocumentBytes, recalculateUserStorage } from './storage.mjs';
import { countWords } from './sanitize.mjs';
import { logAudit } from '../db.mjs';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createStarterWorkspace(db, userId, fullName) {
  const now = new Date().toISOString();
  const folderId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO folders (id, user_id, parent_id, name, color, icon, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'blue', 'book', ?, ?)`
  ).run(folderId, userId, 'Mga Tala sa Klase', now, now);

  const welcomeTitle = 'Maligayang Pagdating sa Tintalata';
  const welcomeHtml = `<h1>Maligayang Pagdating, ${fullName.replace(/[<>&"]/g, '')}!</h1><p>Ito ang iyong pribadong espasyo sa <strong>Tintalata</strong> — isang modernong patnugot ng dokumento at guhit sa wikang Filipino.</p><h2>Mga Maaari Mong Gawin:</h2><ul><li><strong>Sumulat at Mag-format:</strong> Gamitin ang toolbar sa itaas upang pumili ng font, laki, kulay, espasyo ng linya, pagkakahanay, mga talaan, at higit pa.</li><li><strong>Gumuhit ng Doodle:</strong> Pindutin ang <em>Gumuhit sa Pahina</em> o <em>Maglagay ng Doodle Box</em> upang gumawa ng malayang guhit direkta sa dokumento.</li><li><strong>Ayusin sa mga Folder:</strong> Gumawa ng mga nako-customize na folder na may iba't ibang kulay at icon.</li><li><strong>Mag-download at Pamahalaan ang Storage:</strong> Maaaring i-download bilang .docx, .pdf, o .zip, at bantayan ang iyong storage sa MB.</li></ul><blockquote>Paalala: Ligtas at pribado ang lahat ng iyong mga file. Walang ibang makakakita nito nang wala ang iyong pahintulot.</blockquote>`;
  const doodlesJson = '[]';
  const pageDoodleJson = '{"strokes":[],"dataUrl":""}';
  const pageSettingsJson = JSON.stringify({
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
    lineHeight: '1.6',
  });
  const sizeBytes = calculateDocumentBytes({
    title: welcomeTitle,
    contentHtml: welcomeHtml,
    doodlesJson,
    pageDoodleJson,
    pageSettingsJson,
  });

  db.prepare(
    `INSERT INTO documents (
      id, user_id, folder_id, title, content_html, doodles_json, page_doodle_json,
      page_settings_json, word_count, size_bytes, is_favorite, last_opened_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    folderId,
    welcomeTitle,
    welcomeHtml,
    doodlesJson,
    pageDoodleJson,
    pageSettingsJson,
    countWords(welcomeHtml),
    sizeBytes,
    now,
    now,
    now
  );

  recalculateUserStorage(db, userId);
}

/**
 * Creates a persistent student account linked to the primary Admin account.
 * Shared by both public registration and Admin Dashboard account creation.
 */
export function createStudentAccount(
  db,
  {
    fullName = '',
    email = '',
    password = '',
    studentNumber = '',
    courseSection = '',
    storageQuotaBytes = CONFIG.DEFAULT_STORAGE_QUOTA_BYTES,
    createdByAdminId = null,
    markLoggedInNow = false,
  }
) {
  const cleanName = String(fullName).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanStudentNum = String(studentNumber).trim();
  const cleanCourse = String(courseSection).trim();
  const rawPassword = String(password);

  if (cleanName.length < 2 || cleanName.length > 100) {
    return {
      ok: false,
      status: 400,
      error: 'Mangyaring ilagay ang buong pangalan (hindi bababa sa 2 titik).',
    };
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return {
      ok: false,
      status: 400,
      error: 'Mangyaring maglagay ng wastong email address.',
    };
  }
  if (rawPassword.length < 8) {
    return {
      ok: false,
      status: 400,
      error: 'Ang password ay dapat may hindi bababa sa 8 karakter.',
    };
  }
  if (cleanStudentNum.length > 40 || cleanCourse.length > 80) {
    return {
      ok: false,
      status: 400,
      error: 'Masyadong mahaba ang Numero ng Mag-aaral o Kurso/Seksyon.',
    };
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .get(cleanEmail);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'May nakarehistro nang account gamit ang email na ito.',
    };
  }

  const primaryAdmin = createdByAdminId
    ? { id: createdByAdminId }
    : db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(rawPassword);

  try {
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, student_number, course_section,
        role, status, storage_quota_bytes, storage_used_bytes, managed_by_admin_id,
        created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'student', 'active', ?, 0, ?, ?, ?, ?)`
    ).run(
      userId,
      cleanEmail,
      passwordHash,
      cleanName,
      cleanStudentNum,
      cleanCourse,
      Number(storageQuotaBytes),
      primaryAdmin?.id || null,
      now,
      now,
      markLoggedInNow ? now : null
    );
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return {
        ok: false,
        status: 409,
        error: 'May nakarehistro nang account gamit ang email na ito.',
      };
    }
    throw err;
  }

  createStarterWorkspace(db, userId, cleanName);

  logAudit(db, {
    actorId: createdByAdminId || userId,
    targetUserId: userId,
    action: createdByAdminId ? 'ADMIN_CREATED_STUDENT_ACCOUNT' : 'STUDENT_REGISTERED',
    details: createdByAdminId
      ? `Ginawa ng Admin ang account ng mag-aaral: ${cleanEmail}`
      : `Nagparehistro ang mag-aaral at naiugnay sa Admin: ${cleanEmail}`,
  });

  const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return { ok: true, user: createdUser };
}
