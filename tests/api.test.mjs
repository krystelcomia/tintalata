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

  // 5. Download document (.doc) and folder (.zip)
  const dlDoc = await studentA.request(`/api/documents/${docId}/download?format=doc`);
  assert.equal(dlDoc.status, 200);
  assert.ok(dlDoc.body.toString('utf8').includes('Magandang araw!'));

  const dlZip = await studentA.request(`/api/folders/${folderId}/download?format=doc`);
  assert.equal(dlZip.status, 200);
  const zip = await JSZip.loadAsync(dlZip.body);
  const zipFiles = Object.keys(zip.files);
  assert.ok(zipFiles.some((name) => name.includes('Aking Sanaysay.doc')));

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
});
