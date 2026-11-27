import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { createDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { CONFIG } from '../server/config.mjs';
import {
  decryptRecoveryCode,
  encryptRecoveryCode,
  generateRecoveryCode,
  hashRecoveryCode,
} from '../server/utils/crypto.mjs';

async function startTestServer() {
  const db = await createDatabase(':memory:');
  const app = createApp(db, { serveStatic: false });
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        app,
        db,
        server,
        baseUrl: `http://127.0.0.1:${port}`,
      });
    });
  });
}

class CookieClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
  }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      if (pair.endsWith('=')) {
        this.cookie = '';
      } else {
        this.cookie = pair;
      }
    }
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body };
  }
}

test('Tintalata full API, privacy, storage, trash, export, and admin authorization suite', async (t) => {
  const { db, server, baseUrl } = await startTestServer();
  t.after(async () => {
    server.closeAllConnections?.();
    server.close();
    await db.close();
  });

  const studentA = new CookieClient(baseUrl);
  const studentB = new CookieClient(baseUrl);
  const admin = new CookieClient(baseUrl);

  // 1. Health check
  const health = await studentA.request('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.language, 'tl');

  // 2. Register Student A & Student B
  const regA = await studentA.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Maria Clara',
      email: 'maria@paaralan.ph',
      password: 'Password123',
      studentNumber: '2026-0001',
      courseSection: 'BSIT 1-A',
    }),
  });
  assert.equal(regA.status, 201);
  assert.equal(regA.body.user.role, 'student');
  assert.ok(regA.body.storage.quotaMB === 50);
  assert.ok(regA.body.storage.usedBytes > 0);

  const regB = await studentB.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Crisostomo Ibarra',
      email: 'ibarra@paaralan.ph',
      password: 'Password123',
      studentNumber: '2026-0002',
      courseSection: 'BSCS 2-B',
    }),
  });
  assert.equal(regB.status, 201);

  // 3. Customizable Folder & Document CRUD + Sanitization
  const createFolder = await studentA.request('/api/folders', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Filipino 101',
      color: 'indigo',
      icon: 'book',
    }),
  });
  assert.equal(createFolder.status, 201);
  const folderId = createFolder.body.folder.id;

  const createDoc = await studentA.request('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Aking Sanaysay',
      folderId,
      contentHtml:
        '<p>Magandang araw!</p><script>alert(1)</script><p onclick="evil()">Test</p>',
      doodles: [
        {
          id: 'd-1',
          title: 'Bitwin',
          width: 400,
          height: 300,
          background: 'white',
          strokes: [],
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          updatedAt: new Date().toISOString(),
        },
      ],
    }),
  });
  assert.equal(createDoc.status, 201);
  const docId = createDoc.body.document.id;
  assert.ok(!createDoc.body.document.contentHtml.includes('<script>'));
  assert.ok(!createDoc.body.document.contentHtml.includes('onclick='));

  // 4. Student Isolation: Student B cannot view, edit, download, or delete Student A's doc/folder
  const bReadDoc = await studentB.request(`/api/documents/${docId}`);
  assert.equal(bReadDoc.status, 404);
  const bEditFolder = await studentB.request(`/api/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Hacked' }),
  });
  assert.equal(bEditFolder.status, 404);

  // 5. Download document (.docx, .pdf, .doc) and folder (.zip)
  const dlDoc = await studentA.request(`/api/documents/${docId}/download?format=doc`);
  assert.equal(dlDoc.status, 200);
  assert.ok(dlDoc.body.toString('utf8').includes('Magandang araw!'));

  const dlDocx = await studentA.request(`/api/documents/${docId}/download?format=docx`);
  assert.equal(dlDocx.status, 200);
  const docxZip = await JSZip.loadAsync(dlDocx.body);
  assert.ok(docxZip.files['word/document.xml']);

  const dlPdf = await studentA.request(`/api/documents/${docId}/download?format=pdf`);
  assert.equal(dlPdf.status, 200);
  assert.ok(dlPdf.body.toString('latin1').startsWith('%PDF-'));

  const dlZip = await studentA.request(`/api/folders/${folderId}/download?format=docx`);
  assert.equal(dlZip.status, 200);
  const zip = await JSZip.loadAsync(dlZip.body);
  const zipFiles = Object.keys(zip.files);
  assert.ok(zipFiles.some((name) => name.includes('Aking Sanaysay.docx')));

  // 5a. Multi-page blank page breaks & resized image preservation in sanitization and exports
  const multiPageDoc = await studentA.request('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Maraming Pahina',
      contentHtml:
        '<p>Unang Pahina</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" style="display: block; margin-left: auto; margin-right: auto; max-width: 100%; width: 30%; height: auto;" /><hr class="page-break" data-page-break="true" /><p>Ikalawang Pahina</p>',
    }),
  });
  assert.equal(multiPageDoc.status, 201);
  const multiPageDocId = multiPageDoc.body.document.id;
  assert.ok(multiPageDoc.body.document.contentHtml.includes('width: 30%'));
  assert.ok(multiPageDoc.body.document.contentHtml.includes('data-page-break="true"'));

  const multiDocx = await studentA.request(`/api/documents/${multiPageDocId}/download?format=docx`);
  assert.equal(multiDocx.status, 200);
  const multiDocxZip = await JSZip.loadAsync(multiDocx.body);
  const multiDocxXml = await multiDocxZip.files['word/document.xml'].async('string');
  assert.ok(multiDocxXml.includes('Unang Pahina'));
  assert.ok(multiDocxXml.includes('Ikalawang Pahina'));
  assert.ok(multiDocxXml.includes('w:type="page"'));

  const multiPdf = await studentA.request(`/api/documents/${multiPageDocId}/download?format=pdf`);
  assert.equal(multiPdf.status, 200);
  const multiPdfText = multiPdf.body.toString('latin1');
  assert.ok(multiPdfText.startsWith('%PDF-'));
  const pdfPageMatches = multiPdfText.match(/\/Type\s*\/Page\b(?!s)/g) || [];
  assert.ok(pdfPageMatches.length >= 2);

  await studentA.request(`/api/documents/${multiPageDocId}`, { method: 'DELETE' });
  await studentA.request(`/api/trash/documents/${multiPageDocId}`, { method: 'DELETE' });

  // 5b. Favorite, pageDoodle, sharing, and notification settings
  const favPatch = await studentA.request(`/api/documents/${docId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      isFavorite: true,
      pageDoodle: {
        strokes: [{ tool: 'pen', color: '#1d4ed8', width: 4, opacity: 1, points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] }],
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    }),
  });
  assert.equal(favPatch.status, 200);
  assert.equal(favPatch.body.document.isFavorite, true);
  assert.equal(favPatch.body.document.pageDoodle.strokes.length, 1);

  const shareWithB = await studentA.request(`/api/documents/${docId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: 'ibarra@paaralan.ph', permissionLevel: 'read' }),
  });
  assert.equal(shareWithB.status, 201);

  const bSharedList = await studentB.request('/api/documents/shared/list');
  assert.equal(bSharedList.status, 200);
  assert.equal(bSharedList.body.sharedWithMe.length, 1);

  const bOpenShared = await studentB.request(`/api/documents/${docId}`);
  assert.equal(bOpenShared.status, 200);
  assert.equal(bOpenShared.body.permission, 'read');

  const bEditSharedBlocked = await studentB.request(`/api/documents/${docId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Di Dapat Ma-edit' }),
  });
  assert.equal(bEditSharedBlocked.status, 403);

  const aShares = await studentA.request(`/api/documents/${docId}/shares`);
  assert.equal(aShares.status, 200);
  await studentA.request(`/api/documents/${docId}/shares/${aShares.body.shares[0].id}`, {
    method: 'DELETE',
  });

  const profileUpdate = await studentA.request('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      notificationSettings: { notifyAutoSave: false, defaultDownloadFormat: 'pdf' },
    }),
  });
  assert.equal(profileUpdate.status, 200);
  assert.equal(profileUpdate.body.user.notificationSettings.notifyAutoSave, false);
  assert.equal(profileUpdate.body.user.notificationSettings.defaultDownloadFormat, 'pdf');

  // 6. Soft Delete Folder -> Trash -> Restore -> Permanent Delete -> Storage reclaimed
  const delFolder = await studentA.request(`/api/folders/${folderId}`, { method: 'DELETE' });
  assert.equal(delFolder.status, 200);

  const trashList = await studentA.request('/api/trash');
  assert.equal(trashList.status, 200);
  assert.equal(trashList.body.folders.length, 1);
  assert.equal(trashList.body.folders[0].nestedDocCount, 1);

  const restoreFolder = await studentA.request(`/api/trash/folders/${folderId}/restore`, {
    method: 'POST',
  });
  assert.equal(restoreFolder.status, 200);

  const docAfterRestore = await studentA.request(`/api/documents/${docId}`);
  assert.equal(docAfterRestore.status, 200);

  // Soft delete doc individually then permanently delete it
  const storageBeforePerm = docAfterRestore.body.document.sizeBytes;
  const softDelDoc = await studentA.request(`/api/documents/${docId}`, { method: 'DELETE' });
  assert.equal(softDelDoc.status, 200);
  const usedWhileInTrash = softDelDoc.body.storage.usedBytes;

  const permDelDoc = await studentA.request(`/api/trash/documents/${docId}`, {
    method: 'DELETE',
  });
  assert.equal(permDelDoc.status, 200);
  assert.equal(permDelDoc.body.storage.usedBytes, usedWhileInTrash - storageBeforePerm);

  // 7. Admin Login & Privacy Boundary Enforcement
  const adminLogin = await admin.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: CONFIG.ADMIN_SEED_EMAIL,
      password: CONFIG.ADMIN_SEED_PASSWORD,
    }),
  });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.user.role, 'admin');

  const studentsList = await admin.request('/api/admin/students');
  assert.equal(studentsList.status, 200);
  assert.equal(studentsList.body.students.length, 2);
  // Ensure private doc content/titles are NEVER exposed in Admin student listing
  assert.equal(JSON.stringify(studentsList.body).includes('Maligayang Pagdating'), false);

  // Admin CANNOT access Student A's documents without authorization
  const adminUnauthDocs = await admin.request('/api/documents', {
    headers: { 'X-Support-Student-Id': regA.body.user.id },
  });
  assert.equal(adminUnauthDocs.status, 403);

  // Admin requests access -> Student A approves read-only -> Admin reads -> write blocked -> Student revokes -> blocked again
  const reqAccess = await admin.request(`/api/admin/students/${regA.body.user.id}/request-access`, {
    method: 'POST',
    body: JSON.stringify({
      permissionLevel: 'read',
      reason: 'Pagsusuri ng teknikal na problema',
    }),
  });
  assert.equal(reqAccess.status, 201);

  const aGrants = await studentA.request('/api/privacy/grants');
  assert.equal(aGrants.status, 200);
  const pendingGrant = aGrants.body.grants.find((g) => g.status === 'pending');
  assert.ok(pendingGrant);

  const approveGrant = await studentA.request(`/api/privacy/grants/${pendingGrant.id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'approved', permissionLevel: 'read' }),
  });
  assert.equal(approveGrant.status, 200);

  const adminAuthRead = await admin.request('/api/documents', {
    headers: { 'X-Support-Student-Id': regA.body.user.id },
  });
  assert.equal(adminAuthRead.status, 200);

  // Read-only grant blocks admin from creating/modifying documents
  const adminAuthWriteBlocked = await admin.request('/api/documents', {
    method: 'POST',
    headers: { 'X-Support-Student-Id': regA.body.user.id },
    body: JSON.stringify({ title: 'Hindi Dapat Maliha' }),
  });
  assert.equal(adminAuthWriteBlocked.status, 403);

  // Revoke grant -> admin blocked from reading again
  const revoke = await studentA.request(`/api/privacy/grants/${pendingGrant.id}/revoke`, {
    method: 'POST',
  });
  assert.equal(revoke.status, 200);

  const adminAfterRevoke = await admin.request('/api/documents', {
    headers: { 'X-Support-Student-Id': regA.body.user.id },
  });
  assert.equal(adminAfterRevoke.status, 403);

  // 8. Storage Quota Enforcement (Admin lowers Student B quota to 1 MB, Student B exceeds it -> 413)
  const quotaUpdate = await admin.request(`/api/admin/students/${regB.body.user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ storageQuotaMB: 1 }),
  });
  assert.equal(quotaUpdate.status, 200);

  const hugeDoc = await studentB.request('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Sobrang Laking File',
      contentHtml: `<p>${'A'.repeat(1024 * 1024 + 5000)}</p>`,
    }),
  });
  assert.equal(hugeDoc.status, 413);

  // 9. Account Suspension immediately invalidates Student B session AND blocks re-login
  const suspendB = await admin.request(`/api/admin/students/${regB.body.user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(suspendB.status, 200);

  const bMeAfterSuspend = await studentB.request('/api/auth/me');
  assert.equal(bMeAfterSuspend.status, 401);

  const bLoginAfterSuspend = await studentB.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ibarra@paaralan.ph', password: 'Password123' }),
  });
  assert.equal(bLoginAfterSuspend.status, 403);
  assert.ok(bLoginAfterSuspend.body.error.includes('sinuspinde'));

  // 10. Circular folder move prevention & Empty Trash
  const parentF = await studentA.request('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name: 'Pangunahin', color: 'teal', icon: 'flask' }),
  });
  assert.equal(parentF.status, 201);
  const childF = await studentA.request('/api/folders', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Anak na Folder',
      parentId: parentF.body.folder.id,
      color: 'amber',
      icon: 'star',
    }),
  });
  assert.equal(childF.status, 201);

  const circularMove = await studentA.request(`/api/folders/${parentF.body.folder.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId: childF.body.folder.id }),
  });
  assert.equal(circularMove.status, 400);

  const trashDocCreate = await studentA.request('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Pang-basurahan',
      contentHtml: '<p>Testing empty trash</p>',
    }),
  });
  assert.equal(trashDocCreate.status, 201);
  await studentA.request(`/api/documents/${trashDocCreate.body.document.id}`, {
    method: 'DELETE',
  });

  const emptied = await studentA.request('/api/trash', { method: 'DELETE' });
  assert.equal(emptied.status, 200);
  assert.equal(emptied.body.storage.trashBytes, 0);

  // 11. Letters-only >=8 char password registration + studentNumber login + forgot password reset flow
  const studentC = new CookieClient(baseUrl);
  const regC = await studentC.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Krystel Comia',
      email: 'krystel@paaralan.ph',
      password: 'krystelkrystel',
      studentNumber: '20232024317',
      courseSection: 'BSIS',
    }),
  });
  assert.equal(regC.status, 201);
  assert.match(regC.body.recoveryCode, /^\d{6}$/);

  const loginByStudentNum = await studentC.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: '20232024317',
      password: 'krystelkrystel',
      rememberMe: true,
    }),
  });
  assert.equal(loginByStudentNum.status, 200);

  const sentEmailsMain = [];
  db.emailTransport = {
    async send(msg) {
      sentEmailsMain.push(msg);
      return { provider: 'mock-smtp', messageId: `msg-main-${sentEmailsMain.length}` };
    },
  };

  const forgotReq = await studentC.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Krystel Comia',
      email: 'krystel@paaralan.ph',
      studentNumber: '20232024317',
      recoveryCode: regC.body.recoveryCode,
      reason: 'Nakalimutan ang password',
    }),
  });
  assert.equal(forgotReq.status, 201);
  assert.ok(forgotReq.body.referenceNumber.startsWith('TRR-'));

  const resetList = await admin.request('/api/admin/password-resets');
  assert.equal(resetList.status, 200);
  const pendingReset = resetList.body.requests.find(
    (r) => r.email === 'krystel@paaralan.ph' && r.status === 'pending'
  );
  assert.ok(pendingReset);

  const approveReset = await admin.request(`/api/admin/password-resets/${pendingReset.id}/approve`, {
    method: 'POST',
  });
  assert.equal(approveReset.status, 200);
  assert.equal(approveReset.body.emailDelivery.sent, true);

  const approvedMail = sentEmailsMain.find((m) => m.to === 'krystel@paaralan.ph');
  assert.ok(approvedMail);
  const tokenMatchMain = approvedMail.text.match(/token=([a-f0-9]+)/i);
  assert.ok(tokenMatchMain);
  const resetTokenMain = tokenMatchMain[1];

  const completeReset = await new CookieClient(baseUrl).request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token: resetTokenMain,
      newPassword: 'NewTempPassword1',
      confirmPassword: 'NewTempPassword1',
    }),
  });
  assert.equal(completeReset.status, 200);

  const loginWithNewPass = await studentC.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'krystel@paaralan.ph',
      password: 'NewTempPassword1',
    }),
  });
  assert.equal(loginWithNewPass.status, 200);

  // 12. Admin creates a student account directly -> saved in DB linked to Admin -> visible in Admin list -> student logs in via /api/auth/login
  const adminCreateStudent = await admin.request('/api/admin/students', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Ana Santos',
      email: 'ana.santos@paaralan.ph',
      studentNumber: '2026-0888',
      courseSection: 'BSIS 2-B',
      password: 'AnaPassword88',
      storageQuotaMB: 75,
    }),
  });
  assert.equal(adminCreateStudent.status, 201);

  const dbRow = await db.get(
    'SELECT managed_by_admin_id FROM users WHERE email = ?',
    'ana.santos@paaralan.ph'
  );
  assert.ok(dbRow?.managed_by_admin_id);

  const allStudentsAfter = await admin.request('/api/admin/students');
  assert.ok(allStudentsAfter.body.students.some((s) => s.email === 'ana.santos@paaralan.ph'));
  assert.ok(allStudentsAfter.body.students.some((s) => s.email === 'krystel@paaralan.ph'));

  const studentD = new CookieClient(baseUrl);
  const studentDLogin = await studentD.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'ana.santos@paaralan.ph',
      password: 'AnaPassword88',
    }),
  });
  assert.equal(studentDLogin.status, 200);
  assert.equal(studentDLogin.body.user.role, 'student');
  assert.equal(studentDLogin.body.storage.quotaMB, 75);

  // 13. Duplicate email prevention (case-insensitive) via both registration and Admin creation
  const dupReg = await new CookieClient(baseUrl).request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Duplicate User',
      email: 'ANA.SANTOS@PAARALAN.PH',
      password: 'Password123',
    }),
  });
  assert.equal(dupReg.status, 409);

  const dupAdminCreate = await admin.request('/api/admin/students', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Duplicate User',
      email: 'ana.santos@paaralan.ph',
      password: 'Password123',
    }),
  });
  assert.equal(dupAdminCreate.status, 409);

  // 14. Admin can set/reset student password directly from Manage Account modal
  const adminResetDirect = await admin.request(
    `/api/admin/students/${studentDLogin.body.user.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: 'AnaResetPassword99' }),
    }
  );
  assert.equal(adminResetDirect.status, 200);

  const studentDLoginNew = await new CookieClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'ana.santos@paaralan.ph',
      password: 'AnaResetPassword99',
    }),
  });
  assert.equal(studentDLoginNew.status, 200);

  // 15. API responses explicitly disable caching so account updates reflect immediately
  const cacheHeader = health.headers.get('cache-control') || '';
  assert.ok(cacheHeader.includes('no-store'));

  // 16. Immediate mixed-case email registration -> immediate admin visibility -> fresh login
  const studentE = new CookieClient(baseUrl);
  const regE = await studentE.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Krystel Comia Test',
      email: 'Krystel.Verify65@Gmail.com',
      password: 'FourteenCharPw',
      studentNumber: '2026-1278',
      courseSection: 'BSIS',
    }),
  });
  assert.equal(regE.status, 201);

  const adminStudentsNow = await admin.request('/api/admin/students');
  assert.ok(
    adminStudentsNow.body.students.some((s) => s.email === 'krystel.verify65@gmail.com')
  );

  const freshLoginLower = await new CookieClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'krystel.verify65@gmail.com',
      password: 'FourteenCharPw',
    }),
  });
  assert.equal(freshLoginLower.status, 200);

  const freshLoginUpper = await new CookieClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'KRYSTEL.VERIFY65@GMAIL.COM',
      password: 'FourteenCharPw',
    }),
  });
  assert.equal(freshLoginUpper.status, 200);
});

test('Tintalata file-backed persistence, pre-parsed Vercel body, and ephemeral diagnostics', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tintalata-persist-'));
  const dbFile = path.join(tmpDir, 'tintalata-test.db');
  const closers = [];
  t.after(async () => {
    for (const fn of closers) {
      await fn();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Instance 1 writes a student account to disk DB
  const db1 = await createDatabase(dbFile);
  const app1 = createApp(db1, { serveStatic: false });
  const srv1 = http.createServer(app1);
  await new Promise((r) => srv1.listen(0, '127.0.0.1', r));
  const port1 = srv1.address().port;

  const client1 = new CookieClient(`http://127.0.0.1:${port1}`);
  const created = await client1.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Persistent Student',
      email: 'persistent@paaralan.ph',
      password: 'MyExact14Pass!',
    }),
  });
  assert.equal(created.status, 201);

  srv1.closeAllConnections?.();
  srv1.close();
  await db1.close();

  // Instance 2 reopens the same disk DB and verifies account & password work immediately
  const db2 = await createDatabase(dbFile);
  const app2 = createApp(db2, { serveStatic: false });
  // Simulate Vercel pre-parsed req.body wrapper and ephemeral storageMode
  const preParsedWrapper = (req, res) => {
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      req.body = { email: 'persistent@paaralan.ph', password: 'MyExact14Pass!' };
    }
    return app2(req, res);
  };
  const srv2 = http.createServer(preParsedWrapper);
  await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  closers.push(async () => {
    srv2.closeAllConnections?.();
    srv2.close();
    await db2.close();
  });
  const port2 = srv2.address().port;

  const client2 = new CookieClient(`http://127.0.0.1:${port2}`);
  const loginAfterRestart = await client2.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'persistent@paaralan.ph',
      password: 'MyExact14Pass!',
    }),
  });
  assert.equal(loginAfterRestart.status, 200);
  assert.equal(loginAfterRestart.body.user.email, 'persistent@paaralan.ph');

  // Verify sqlite-ephemeral empty-student diagnostic when no students exist
  const dbEph = await createDatabase(':memory:');
  dbEph.storageMode = 'sqlite-ephemeral';
  const appEph = createApp(dbEph, { serveStatic: false });
  const srvEph = http.createServer(appEph);
  await new Promise((r) => srvEph.listen(0, '127.0.0.1', r));
  closers.push(async () => {
    srvEph.closeAllConnections?.();
    srvEph.close();
    await dbEph.close();
  });
  const ephClient = new CookieClient(`http://127.0.0.1:${srvEph.address().port}`);
  const ephLogin = await ephClient.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'missing@paaralan.ph', password: 'SomePassword123' }),
  });
  assert.equal(ephLogin.status, 401);
  assert.ok(ephLogin.body.error.includes('POSTGRES_URL'));

  // Simulate multi-instance Vercel serverless scaling under sqlite-ephemeral:
  // Admin logs in on Container A -> 4 parallel /api/admin/* calls hit Container B cleanly without 401 bounce
  const adminEphLogin = await ephClient.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: CONFIG.ADMIN_SEED_EMAIL,
      password: CONFIG.ADMIN_SEED_PASSWORD,
      rememberMe: true,
    }),
  });
  assert.equal(adminEphLogin.status, 200);
  assert.ok(ephClient.cookie);

  const dbEph2 = await createDatabase(':memory:');
  dbEph2.storageMode = 'sqlite-ephemeral';
  const appEph2 = createApp(dbEph2, { serveStatic: false });
  const srvEph2 = http.createServer(appEph2);
  await new Promise((r) => srvEph2.listen(0, '127.0.0.1', r));
  closers.push(async () => {
    srvEph2.closeAllConnections?.();
    srvEph2.close();
    await dbEph2.close();
  });

  const ephClientContainerB = new CookieClient(`http://127.0.0.1:${srvEph2.address().port}`);
  ephClientContainerB.cookie = ephClient.cookie;
  const [ov2, st2, log2, rst2] = await Promise.all([
    ephClientContainerB.request('/api/admin/overview'),
    ephClientContainerB.request('/api/admin/students'),
    ephClientContainerB.request('/api/admin/audit-logs'),
    ephClientContainerB.request('/api/admin/password-resets'),
  ]);
  assert.equal(ov2.status, 200);
  assert.equal(st2.status, 200);
  assert.equal(log2.status, 200);
  assert.equal(rst2.status, 200);

  // Student registers on Container A -> Container B accepts valid signed session without kicking back to /login
  const studentEphA = new CookieClient(`http://127.0.0.1:${srvEph.address().port}`);
  const studentEphReg = await studentEphA.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Serverless Student',
      email: 'serverless@paaralan.ph',
      password: 'Password1234',
    }),
  });
  assert.equal(studentEphReg.status, 201);

  const studentEphB = new CookieClient(`http://127.0.0.1:${srvEph2.address().port}`);
  studentEphB.cookie = studentEphA.cookie;
  const studentMeB = await studentEphB.request('/api/auth/me');
  assert.equal(studentMeB.status, 200);
  assert.equal(studentMeB.body.user.email, 'serverless@paaralan.ph');
});

test('Tintalata sliding persistent sessions and unlinked student auto-linking to Admin', async (t) => {
  const { db, server, baseUrl } = await startTestServer();
  t.after(async () => {
    server.closeAllConnections?.();
    server.close();
    await db.close();
  });

  const admin = new CookieClient(baseUrl);
  const adminLogin = await admin.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: CONFIG.ADMIN_SEED_EMAIL,
      password: CONFIG.ADMIN_SEED_PASSWORD,
      rememberMe: false,
    }),
  });
  assert.equal(adminLogin.status, 200);
  const setCookieHeader = adminLogin.headers.get('set-cookie') || '';
  assert.ok(setCookieHeader.includes('Max-Age=34560000'));

  // Insert/register a student, then simulate legacy/unlinked managed_by_admin_id = NULL
  const student = new CookieClient(baseUrl);
  const reg = await student.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Unlinked Student',
      email: 'unlinked@paaralan.ph',
      password: 'Password1234',
    }),
  });
  assert.equal(reg.status, 201);
  await db.run('UPDATE users SET managed_by_admin_id = NULL WHERE id = ?', reg.body.user.id);

  // Admin list/overview auto-links unlinked student accounts and returns all linked accounts
  const list = await admin.request('/api/admin/students');
  assert.equal(list.status, 200);
  const listed = list.body.students.find((s) => s.id === reg.body.user.id);
  assert.ok(listed);
  assert.equal(listed.linkedAdminId, adminLogin.body.user.id);
  assert.equal(listed.linkedAdminEmail, CONFIG.ADMIN_SEED_EMAIL);

  // Simulate session approaching renewal threshold (< 395 days left): using the app slides expires_at forward
  const nearTerm = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();
  await db.run('UPDATE sessions SET expires_at = ? WHERE user_id = ?', nearTerm, reg.body.user.id);

  const meRes = await student.request('/api/auth/me');
  assert.equal(meRes.status, 200);
  const renewedCookie = meRes.headers.get('set-cookie') || '';
  assert.ok(renewedCookie.includes('Max-Age=34560000'));

  const sessionRow = await db.get(
    'SELECT expires_at FROM sessions WHERE user_id = ? LIMIT 1',
    reg.body.user.id
  );
  assert.ok(new Date(sessionRow.expires_at).getTime() > Date.now() + 395 * 24 * 60 * 60 * 1000);

  // Explicit logout revokes session cleanly
  const logoutRes = await student.request('/api/auth/logout', { method: 'POST' });
  assert.equal(logoutRes.status, 200);
  const afterLogoutMe = await student.request('/api/auth/me');
  assert.equal(afterLogoutMe.status, 401);
});

test('Admin-managed forgot password request, approval, rejection, email failure handling, status tracking, tokens, notifications, and rate limits', async (t) => {
  const { app, db, server, baseUrl } = await startTestServer();
  t.after(async () => {
    server.closeAllConnections?.();
    server.close();
    await db.close();
  });

  const admin = new CookieClient(baseUrl);
  const student = new CookieClient(baseUrl);
  const publicClient = new CookieClient(baseUrl);

  const adminLogin = await admin.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: CONFIG.ADMIN_SEED_EMAIL,
      password: CONFIG.ADMIN_SEED_PASSWORD,
    }),
  });
  assert.equal(adminLogin.status, 200);

  const reg = await student.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      password: 'JuanOldPassword1',
      studentNumber: '2026-1001',
      courseSection: 'BSIS 3-A',
    }),
  });
  assert.equal(reg.status, 201);
  const juanRecoveryCode = reg.body.recoveryCode;
  assert.match(juanRecoveryCode, /^\d{6}$/);

  // Student tries unauthorized admin endpoints -> rejected
  const unauthList = await student.request('/api/admin/password-resets');
  assert.equal(unauthList.status, 403);

  // Student logs out before submitting forgot password request
  await student.request('/api/auth/logout', { method: 'POST' });

  // 1. Identity verification rejects mismatched name or student ID
  const mismatch = await publicClient.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Wrong Name',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Forgot password',
    }),
  });
  assert.equal(mismatch.status, 400);

  // 2. Valid request succeeds with Pending status + TRR reference code
  const req1 = await publicClient.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Nagpalit ng telepono at nakalimutan ang password',
    }),
  });
  assert.equal(req1.status, 201);
  assert.equal(req1.body.status, 'pending');
  const ref1 = req1.body.referenceNumber;
  assert.ok(ref1.startsWith('TRR-'));

  // 3. Duplicate active request is prevented
  const dupReq = await publicClient.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Another attempt',
    }),
  });
  assert.equal(dupReq.status, 409);

  // 4. Public status tracking (without login) shows pending and protects sensitive student fields
  const statusPending = await publicClient.request('/api/auth/reset-status', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', referenceNumber: ref1 }),
  });
  assert.equal(statusPending.status, 200);
  assert.equal(statusPending.body.status, 'pending');
  assert.equal(statusPending.body.statusMessage, 'Your request is waiting for Admin review.');
  assert.equal(statusPending.body.courseSection, undefined);

  const wrongEmailStatus = await publicClient.request('/api/auth/reset-status', {
    method: 'POST',
    body: JSON.stringify({ email: 'other@paaralan.ph', referenceNumber: ref1 }),
  });
  assert.equal(wrongEmailStatus.status, 404);

  // 5. Admin inspects pending filter & rejects request (requires reason)
  const sentEmails = [];
  db.emailTransport = {
    async send(msg) {
      sentEmails.push(msg);
      return { provider: 'mock-smtp', messageId: `msg-${sentEmails.length}` };
    },
  };

  const pendingList = await admin.request('/api/admin/password-resets?status=pending');
  assert.equal(pendingList.status, 200);
  assert.equal(pendingList.body.counts.pending, 1);
  const req1Row = pendingList.body.requests.find((r) => r.referenceNumber === ref1);
  assert.ok(req1Row);

  const rejectNoReason = await admin.request(`/api/admin/password-resets/${req1Row.id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: '' }),
  });
  assert.equal(rejectNoReason.status, 400);

  const rejectWithReason = await admin.request(`/api/admin/password-resets/${req1Row.id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Kailangan ng beripikasyon sa Registrar Office' }),
  });
  assert.equal(rejectWithReason.status, 200);
  assert.equal(rejectWithReason.body.emailDelivery.sent, true);

  const rejectionMail = sentEmails.find((e) => e.subject.includes('Tinanggihan'));
  assert.ok(rejectionMail);
  assert.ok(rejectionMail.text.includes('Kailangan ng beripikasyon sa Registrar Office'));

  const statusRejected = await publicClient.request('/api/auth/reset-status', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', referenceNumber: ref1 }),
  });
  assert.equal(statusRejected.status, 200);
  assert.equal(statusRejected.body.status, 'rejected');
  assert.equal(
    statusRejected.body.statusMessage,
    'Your request has been rejected. Check your email for the reason.'
  );
  assert.equal(statusRejected.body.rejectionReason, 'Kailangan ng beripikasyon sa Registrar Office');

  // 6. After rejection, student can submit a fresh request; test email delivery failure handling on approval
  const req2 = await publicClient.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Kumpleto na ang beripikasyon sa Registrar',
    }),
  });
  assert.equal(req2.status, 201);
  const ref2 = req2.body.referenceNumber;

  const listAfterReq2 = await admin.request('/api/admin/password-resets?status=pending');
  const req2Row = listAfterReq2.body.requests.find((r) => r.referenceNumber === ref2);
  assert.ok(req2Row);

  // Force email failure on approve -> status still becomes approved & DB records 'failed' (NEVER 'sent')
  db.emailTransport = {
    async send() {
      throw new Error('Simulated SMTP timeout');
    },
  };
  const approveFailedEmail = await admin.request(`/api/admin/password-resets/${req2Row.id}/approve`, {
    method: 'POST',
  });
  assert.equal(approveFailedEmail.status, 200);
  assert.equal(approveFailedEmail.body.emailDelivery.sent, false);

  const failedEmailDbRow = await db.get(
    'SELECT status, error_message FROM email_notifications WHERE reset_request_id = ? ORDER BY created_at DESC LIMIT 1',
    req2Row.id
  );
  assert.equal(failedEmailDbRow.status, 'failed');
  assert.ok(failedEmailDbRow.error_message.includes('Simulated SMTP timeout'));

  // 7. Admin approval does NOT auto-change password
  const loginStillOldBeforeReset = await student.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', password: 'JuanOldPassword1' }),
  });
  assert.equal(loginStillOldBeforeReset.status, 200);
  await student.request('/api/auth/logout', { method: 'POST' });

  // 8. Admin resends email with working transport -> gets valid 15-min reset link + token
  db.emailTransport = {
    async send(msg) {
      sentEmails.push(msg);
      return { provider: 'mock-smtp', messageId: `msg-${sentEmails.length}` };
    },
  };
  const resendRes = await admin.request(`/api/admin/password-resets/${req2Row.id}/resend-email`, {
    method: 'POST',
  });
  assert.equal(resendRes.status, 200);
  assert.equal(resendRes.body.emailDelivery.sent, true);

  const statusApproved = await publicClient.request('/api/auth/reset-status', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', referenceNumber: ref2 }),
  });
  assert.equal(statusApproved.status, 200);
  assert.equal(statusApproved.body.status, 'approved');
  assert.equal(
    statusApproved.body.statusMessage,
    'Your request has been approved. Please check your registered email for the reset link.'
  );

  const approvedMail = sentEmails.filter((m) => m.subject.includes('Naaprubahan')).pop();
  assert.ok(approvedMail);
  const tokenMatch = approvedMail.text.match(/token=([a-f0-9]+)/i);
  assert.ok(tokenMatch);
  const rawToken = tokenMatch[1];

  // 9. Token validation + weak/mismatched password rejection + expired token check
  const invalidTokenCheck = await publicClient.request(
    `/api/auth/reset-password/validate?token=${'f'.repeat(64)}`
  );
  assert.equal(invalidTokenCheck.status, 404);

  const validTokenCheck = await publicClient.request(
    `/api/auth/reset-password/validate?token=${rawToken}`
  );
  assert.equal(validTokenCheck.status, 200);
  assert.equal(validTokenCheck.body.valid, true);
  assert.equal(validTokenCheck.body.referenceNumber, ref2);

  const weakPassRes = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: rawToken, newPassword: 'weak', confirmPassword: 'weak' }),
  });
  assert.equal(weakPassRes.status, 400);

  const mismatchPassRes = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token: rawToken,
      newPassword: 'JuanNewPassword2026',
      confirmPassword: 'DifferentPassword2026',
    }),
  });
  assert.equal(mismatchPassRes.status, 400);

  // 10. Student completes password reset -> request becomes completed -> confirmation email omits new password
  const newPasswordPlain = 'JuanNewPassword2026';
  const resetDone = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token: rawToken,
      newPassword: newPasswordPlain,
      confirmPassword: newPasswordPlain,
    }),
  });
  assert.equal(resetDone.status, 200);

  const changedMail = sentEmails.find((m) => m.subject.includes('Napalitan ang Iyong Password'));
  assert.ok(changedMail);
  assert.equal(changedMail.text.includes(newPasswordPlain), false);
  assert.equal(changedMail.html.includes(newPasswordPlain), false);

  const statusCompleted = await publicClient.request('/api/auth/reset-status', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', referenceNumber: ref2 }),
  });
  assert.equal(statusCompleted.status, 200);
  assert.equal(statusCompleted.body.status, 'completed');
  assert.equal(statusCompleted.body.statusMessage, 'Your password has been successfully changed.');

  // 11. Single-use token protection: second use fails with 410
  const replayRes = await publicClient.request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token: rawToken,
      newPassword: 'AnotherPassword123',
      confirmPassword: 'AnotherPassword123',
    }),
  });
  assert.equal(replayRes.status, 410);

  // Expired token (>15 mins) check: backdate an unused token and verify validate returns 410
  await db.run(
    `UPDATE password_reset_tokens SET used_at = NULL, expires_at = ? WHERE request_id = ?`,
    new Date(Date.now() - 60_000).toISOString(),
    req2Row.id
  );
  await db.run(`UPDATE password_reset_requests SET status = 'approved' WHERE id = ?`, req2Row.id);
  const expiredTokenCheck = await publicClient.request(
    `/api/auth/reset-password/validate?token=${rawToken}`
  );
  assert.equal(expiredTokenCheck.status, 410);
  await db.run(
    `UPDATE password_reset_tokens SET used_at = ? WHERE request_id = ?`,
    new Date().toISOString(),
    req2Row.id
  );
  await db.run(`UPDATE password_reset_requests SET status = 'completed' WHERE id = ?`, req2Row.id);

  // 12. Student logs in with NEW password (old fails) & sees DB-persisted notifications saved while logged out
  const oldLoginFail = await student.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', password: 'JuanOldPassword1' }),
  });
  assert.equal(oldLoginFail.status, 401);

  const newLoginOk = await student.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'juan.delacruz@paaralan.ph', password: newPasswordPlain }),
  });
  assert.equal(newLoginOk.status, 200);

  const notifsRes = await student.request('/api/notifications');
  assert.equal(notifsRes.status, 200);
  assert.equal(notifsRes.body.unreadCount, 3);
  const approvedNotif = notifsRes.body.notifications.find((n) => n.type === 'password_reset_approved');
  const rejectedNotif = notifsRes.body.notifications.find((n) => n.type === 'password_reset_rejected');
  assert.equal(
    approvedNotif.message,
    'Your password reset request has been approved by the Admin. Please check your registered email for the password reset link.'
  );
  assert.equal(
    rejectedNotif.message,
    'Your password reset request has been rejected. Reason: Kailangan ng beripikasyon sa Registrar Office.'
  );

  // Mark one read, then mark all read while preserving notification history
  const readOne = await student.request(`/api/notifications/${approvedNotif.id}/read`, {
    method: 'POST',
  });
  assert.equal(readOne.status, 200);
  assert.equal(readOne.body.unreadCount, 2);

  const readAll = await student.request('/api/notifications/read-all', { method: 'POST' });
  assert.equal(readAll.status, 200);
  assert.equal(readAll.body.unreadCount, 0);

  const notifsAfterRead = await student.request('/api/notifications');
  assert.equal(notifsAfterRead.body.notifications.length, 3);
  assert.equal(notifsAfterRead.body.unreadCount, 0);

  // 13. Activity logs contain complete audit trail
  const auditRes = await admin.request('/api/admin/audit-logs');
  const actions = auditRes.body.logs.map((l) => l.action);
  for (const expectedAction of [
    'STUDENT_PASSWORD_RESET_VERIFICATION_FAILED',
    'STUDENT_PASSWORD_RESET_REQUESTED',
    'ADMIN_REJECTED_PASSWORD_RESET',
    'ADMIN_APPROVED_PASSWORD_RESET',
    'ADMIN_RESENT_PASSWORD_RESET_EMAIL',
    'STUDENT_PASSWORD_RESET_COMPLETED',
  ]) {
    assert.ok(actions.includes(expectedAction), `Missing audit action: ${expectedAction}`);
  }

  // 14. Rate limiting on forgot-password endpoint
  app.locals.rateLimitOverrides = { 'forgot-password': 1 };
  const rlClient = new CookieClient(baseUrl);
  const rlFirst = await rlClient.request('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.99' },
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Rate limit test 1',
    }),
  });
  assert.equal(rlFirst.status, 201);
  const rlBlocked = await rlClient.request('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.99' },
    body: JSON.stringify({
      fullName: 'Juan Dela Cruz',
      email: 'juan.delacruz@paaralan.ph',
      studentNumber: '2026-1001',
      recoveryCode: juanRecoveryCode,
      reason: 'Rate limit test 2',
    }),
  });
  assert.equal(rlBlocked.status, 429);
});

test('Student 6-digit recovery code generation, leading-zero preservation, cross-account rejection, Admin management, invalidation, and brute-force blocking', async (t) => {
  const { app, db, server, baseUrl } = await startTestServer();
  t.after(async () => {
    server.closeAllConnections?.();
    server.close();
    await db.close();
  });

  // 1. Unit check: 250 generated codes are all 6-digit numeric strings (never letters/symbols)
  for (let i = 0; i < 250; i += 1) {
    const c = generateRecoveryCode();
    assert.equal(typeof c, 'string');
    assert.equal(c.length, 6);
    assert.match(c, /^\d{6}$/);
  }

  const admin = new CookieClient(baseUrl);
  const alice = new CookieClient(baseUrl);
  const bob = new CookieClient(baseUrl);
  const anon = new CookieClient(baseUrl);

  const adminLogin = await admin.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: CONFIG.ADMIN_SEED_EMAIL,
      password: CONFIG.ADMIN_SEED_PASSWORD,
    }),
  });
  assert.equal(adminLogin.status, 200);

  // 2. Register Alice & Bob -> both receive 6-digit recovery codes once at creation
  const regAlice = await alice.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Alice Mendoza',
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      courseSection: 'BSIS 2-A',
      password: 'AlicePassword1',
    }),
  });
  assert.equal(regAlice.status, 201);
  assert.match(regAlice.body.recoveryCode, /^\d{6}$/);
  assert.equal(regAlice.body.user.recoveryCode, undefined);
  const aliceId = regAlice.body.user.id;

  const regBob = await bob.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Bob Santos',
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      courseSection: 'BSIS 2-B',
      password: 'BobPassword2',
    }),
  });
  assert.equal(regBob.status, 201);
  const bobCode = regBob.body.recoveryCode;
  assert.match(bobCode, /^\d{6}$/);
  const bobId = regBob.body.user.id;

  // Profile /auth/me must NEVER expose complete recoveryCode
  const aliceMe = await alice.request('/api/auth/me');
  assert.equal(aliceMe.status, 200);
  assert.equal(aliceMe.body.user.recoveryCode, undefined);

  // 3. Unauthorized access checks on recovery code endpoints
  const bobRevealAlice = await bob.request(`/api/admin/students/${aliceId}/recovery-code/reveal`, {
    method: 'POST',
  });
  assert.equal(bobRevealAlice.status, 403);

  const anonAdminCodes = await anon.request('/api/admin/recovery-codes');
  assert.equal(anonAdminCodes.status, 401);

  // 4. Preserve leading zeros ('004821') across encryption, DB storage, reveal, and verification
  const leadingZeroCode = '004821';
  await db.run(
    'UPDATE student_recovery_codes SET code_hmac = ?, code_ciphertext = ? WHERE user_id = ? AND status = \'active\'',
    hashRecoveryCode(aliceId, leadingZeroCode),
    encryptRecoveryCode(leadingZeroCode, aliceId),
    aliceId
  );

  // Stored row in DB must be encrypted, NOT plaintext
  const storedAliceRow = await db.get(
    'SELECT code_hmac, code_ciphertext FROM student_recovery_codes WHERE user_id = ? AND status = \'active\'',
    aliceId
  );
  assert.notEqual(storedAliceRow.code_ciphertext, leadingZeroCode);
  assert.ok(storedAliceRow.code_ciphertext.startsWith('v1:'));
  assert.notEqual(storedAliceRow.code_hmac, leadingZeroCode);
  assert.equal(decryptRecoveryCode(storedAliceRow.code_ciphertext, aliceId), leadingZeroCode);
  // Decryption bound to wrong userId must fail (AAD binding)
  assert.equal(decryptRecoveryCode(storedAliceRow.code_ciphertext, bobId), null);

  // Admin can search & securely reveal leading-zero code
  const adminSearch = await admin.request('/api/admin/recovery-codes?search=2026-A001');
  assert.equal(adminSearch.status, 200);
  assert.equal(adminSearch.body.records.length, 1);
  assert.equal(adminSearch.body.records[0].recoveryCode.status, 'active');
  assert.equal(adminSearch.body.records[0].recoveryCodePlain, undefined);

  const adminReveal = await admin.request(`/api/admin/students/${aliceId}/recovery-code/reveal`, {
    method: 'POST',
  });
  assert.equal(adminReveal.status, 200);
  assert.equal(adminReveal.body.recoveryCode, leadingZeroCode);

  // 5. Validation failures: incomplete, non-numeric, wrong code, wrong student, bypass attempts
  await alice.request('/api/auth/logout', { method: 'POST' });

  for (const badCode of ['4821', '00482', '1234567', '00482a', '004-21', '00 821', '']) {
    const res = await anon.request('/api/auth/verify-recovery-code', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice.mendoza@paaralan.ph',
        studentNumber: '2026-A001',
        recoveryCode: badCode,
      }),
    });
    assert.equal(res.status, 400, `Expected 400 for malformed code "${badCode}"`);
  }

  // Wrong code for Alice (valid format) -> rejected
  const wrongAlice = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      recoveryCode: '999999',
    }),
  });
  assert.equal(wrongAlice.status, 400);

  // Cross-account test: Bob's recovery code cannot verify Alice's account
  const bobCodeForAlice = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      recoveryCode: bobCode === leadingZeroCode ? '999998' : bobCode,
    }),
  });
  assert.equal(bobCodeForAlice.status, 400);

  // Cannot bypass recovery code verification by posting directly to /forgot-password
  const bypassForgot = await anon.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Alice Mendoza',
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      reason: 'Trying to skip recovery code',
    }),
  });
  assert.equal(bypassForgot.status, 400);

  // 6. Correct leading-zero code passes Step 1 verification -> then Admin regenerates BEFORE Step 2
  const aliceVerify1 = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      recoveryCode: leadingZeroCode,
    }),
  });
  assert.equal(aliceVerify1.status, 200);
  assert.equal(aliceVerify1.body.verified, true);
  const oldProofToken = aliceVerify1.body.recoveryProofToken;
  assert.ok(oldProofToken);

  // Cross-account token swap: Alice's proof token cannot submit a request for Bob
  const swapProof = await anon.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      recoveryProofToken: oldProofToken,
      fullName: 'Bob Santos',
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      reason: 'Cross-account token attack',
    }),
  });
  assert.equal(swapProof.status, 400);

  // Admin regenerates Alice's recovery code -> immediately invalidates old '004821'
  const regen = await admin.request(`/api/admin/students/${aliceId}/recovery-code/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Student lost previous recovery code' }),
  });
  assert.equal(regen.status, 200);
  const newAliceCode = regen.body.recoveryCode;
  assert.match(newAliceCode, /^\d{6}$/);
  assert.notEqual(newAliceCode, leadingZeroCode);
  assert.equal(regen.body.invalidatedPrevious, true);

  // Old code '004821' is immediately rejected
  const oldCodeVerify = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      recoveryCode: leadingZeroCode,
    }),
  });
  assert.equal(oldCodeVerify.status, 400);

  // Step-1 proof token minted from the old code is ALSO immediately rejected on Step 2
  const staleProofSubmit = await anon.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      recoveryProofToken: oldProofToken,
      fullName: 'Alice Mendoza',
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      reason: 'Using invalidated proof token',
    }),
  });
  assert.equal(staleProofSubmit.status, 400);

  // 7. Verified new code -> enters Pending Admin approval -> Approve sends 15-min reset link
  const sentEmails = [];
  db.emailTransport = {
    async send(msg) {
      sentEmails.push(msg);
      return { provider: 'mock-smtp', messageId: `msg-rc-${sentEmails.length}` };
    },
  };

  const aliceVerify2 = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    body: JSON.stringify({
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      recoveryCode: newAliceCode,
    }),
  });
  assert.equal(aliceVerify2.status, 200);

  const verifiedSubmit = await anon.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      recoveryProofToken: aliceVerify2.body.recoveryProofToken,
      fullName: 'Alice Mendoza',
      email: 'alice.mendoza@paaralan.ph',
      studentNumber: '2026-A001',
      reason: 'Nakalimutan ang password pagkatapos ng update',
    }),
  });
  assert.equal(verifiedSubmit.status, 201);
  assert.equal(verifiedSubmit.body.status, 'pending');

  // Verify Alice's password was NOT automatically changed yet
  const aliceStillOldLogin = await alice.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alice.mendoza@paaralan.ph', password: 'AlicePassword1' }),
  });
  assert.equal(aliceStillOldLogin.status, 200);

  const pendingReqs = await admin.request('/api/admin/password-resets?status=pending');
  const aliceReq = pendingReqs.body.requests.find(
    (r) => r.email === 'alice.mendoza@paaralan.ph' && r.status === 'pending'
  );
  assert.ok(aliceReq);

  const approveAlice = await admin.request(`/api/admin/password-resets/${aliceReq.id}/approve`, {
    method: 'POST',
  });
  assert.equal(approveAlice.status, 200);
  assert.equal(approveAlice.body.emailDelivery.sent, true);

  // 8. Brute-force consecutive wrong recovery code block + IP rate limit check
  for (let attempt = 1; attempt <= CONFIG.RECOVERY_MAX_FAILED_ATTEMPTS; attempt += 1) {
    const res = await anon.request('/api/auth/verify-recovery-code', {
      method: 'POST',
      headers: { 'x-forwarded-for': `198.51.100.${attempt}` },
      body: JSON.stringify({
        email: 'bob.santos@paaralan.ph',
        studentNumber: '2026-B002',
        recoveryCode: bobCode === '777777' ? '888888' : '777777',
      }),
    });
    assert.equal(
      res.status,
      attempt === CONFIG.RECOVERY_MAX_FAILED_ATTEMPTS ? 429 : 400
    );
  }

  // Even Bob's real code is now temporarily blocked (429) due to consecutive failures
  const bobBlocked = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.99' },
    body: JSON.stringify({
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      recoveryCode: bobCode,
    }),
  });
  assert.equal(bobBlocked.status, 429);

  // Admin regenerating Bob's code clears the block and issues a fresh active code
  const bobRegen = await admin.request(`/api/admin/students/${bobId}/recovery-code/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Cleared temporary block with fresh code' }),
  });
  assert.equal(bobRegen.status, 200);

  const bobUnblocked = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.100' },
    body: JSON.stringify({
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      recoveryCode: bobRegen.body.recoveryCode,
    }),
  });
  assert.equal(bobUnblocked.status, 200);

  // IP rate limiter on /verify-recovery-code
  app.locals.rateLimitOverrides = { 'verify-recovery': 1 };
  const ipRl1 = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.77' },
    body: JSON.stringify({
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      recoveryCode: bobRegen.body.recoveryCode,
    }),
  });
  assert.equal(ipRl1.status, 200);
  const ipRl2 = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.77' },
    body: JSON.stringify({
      email: 'bob.santos@paaralan.ph',
      studentNumber: '2026-B002',
      recoveryCode: bobRegen.body.recoveryCode,
    }),
  });
  assert.equal(ipRl2.status, 429);

  // 9. Verify Audit Logs contain all recovery lifecycle actions and ZERO plaintext codes
  const auditLogsRes = await admin.request('/api/admin/audit-logs');
  const auditActions = auditLogsRes.body.logs.map((l) => l.action);
  for (const expected of [
    'STUDENT_RECOVERY_CODE_GENERATED',
    'ADMIN_VIEWED_RECOVERY_CODE',
    'STUDENT_RECOVERY_VERIFICATION_FAILED',
    'STUDENT_RECOVERY_CODE_VERIFIED',
    'ADMIN_INVALIDATED_RECOVERY_CODE',
    'ADMIN_REGENERATED_RECOVERY_CODE',
    'RECOVERY_CODE_TEMP_BLOCKED',
  ]) {
    assert.ok(auditActions.includes(expected), `Expected audit action ${expected}`);
  }
  const allAuditText = JSON.stringify(auditLogsRes.body.logs);
  assert.equal(allAuditText.includes(leadingZeroCode), false);
  assert.equal(allAuditText.includes(newAliceCode), false);
  assert.equal(allAuditText.includes(bobRegen.body.recoveryCode), false);

  // 10. Student can provide their own 6-digit recovery code (preserving leading zeros) during registration
  const badCustomReg = await new CookieClient(baseUrl).request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Clara Reyes',
      email: 'clara.reyes@paaralan.ph',
      studentNumber: '2026-C003',
      password: 'ClaraPassword1',
      recoveryCode: '12a456',
    }),
  });
  assert.equal(badCustomReg.status, 400);

  const customReg = await new CookieClient(baseUrl).request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Clara Reyes',
      email: 'clara.reyes@paaralan.ph',
      studentNumber: '2026-C003',
      password: 'ClaraPassword1',
      recoveryCode: '007319',
    }),
  });
  assert.equal(customReg.status, 201);
  assert.equal(customReg.body.recoveryCode, '007319');

  app.locals.rateLimitOverrides = {};
  const verifyCustom = await anon.request('/api/auth/verify-recovery-code', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.210' },
    body: JSON.stringify({
      email: 'clara.reyes@paaralan.ph',
      studentNumber: '2026-C003',
      recoveryCode: '007319',
    }),
  });
  assert.equal(verifyCustom.status, 200);
  assert.equal(verifyCustom.body.verified, true);
});
