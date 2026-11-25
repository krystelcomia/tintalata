import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import { createDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { CONFIG } from '../server/config.mjs';

function startTestServer() {
  const db = createDatabase(':memory:');
  const app = createApp(db, { serveStatic: false });
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
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
  t.after(() => {
    server.close();
    db.close();
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

  const loginByStudentNum = await studentC.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: '20232024317',
      password: 'krystelkrystel',
      rememberMe: true,
    }),
  });
  assert.equal(loginByStudentNum.status, 200);

  const forgotReq = await studentC.request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      email: 'krystel@paaralan.ph',
      studentNumber: '20232024317',
      reason: 'Nakalimutan ang password',
    }),
  });
  assert.equal(forgotReq.status, 200);

  const resetList = await admin.request('/api/admin/password-resets');
  assert.equal(resetList.status, 200);
  const pendingReset = resetList.body.requests.find(
    (r) => r.email === 'krystel@paaralan.ph' && r.status === 'pending'
  );
  assert.ok(pendingReset);

  const resolveReset = await admin.request(`/api/admin/password-resets/${pendingReset.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reset', newPassword: 'NewTempPassword1' }),
  });
  assert.equal(resolveReset.status, 200);

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

  const dbRow = db
    .prepare('SELECT managed_by_admin_id FROM users WHERE email = ?')
    .get('ana.santos@paaralan.ph');
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
});
