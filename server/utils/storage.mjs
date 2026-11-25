export function calculateDocumentBytes({
  title = '',
  contentHtml = '',
  doodlesJson = '[]',
  pageDoodleJson = '{"strokes":[],"dataUrl":""}',
  pageSettingsJson = '{}',
}) {
  return (
    Buffer.byteLength(String(title), 'utf8') +
    Buffer.byteLength(String(contentHtml), 'utf8') +
    Buffer.byteLength(String(doodlesJson), 'utf8') +
    Buffer.byteLength(String(pageDoodleJson), 'utf8') +
    Buffer.byteLength(String(pageSettingsJson), 'utf8')
  );
}

export async function recalculateUserStorage(db, userId) {
  const row = await db.get(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM documents WHERE user_id = ?',
    userId
  );
  const totalBytes = Number(row?.total_bytes || 0);
  await db.run('UPDATE users SET storage_used_bytes = ? WHERE id = ?', totalBytes, userId);
  return totalBytes;
}

export async function getStorageSummary(db, userId) {
  const user = await db.get(
    'SELECT storage_quota_bytes, storage_used_bytes FROM users WHERE id = ?',
    userId
  );

  const stats = await db.get(
    `SELECT
      COALESCE(SUM(CASE WHEN is_deleted = 0 THEN size_bytes ELSE 0 END), 0) AS active_bytes,
      COALESCE(SUM(CASE WHEN is_deleted = 1 THEN size_bytes ELSE 0 END), 0) AS trash_bytes,
      COALESCE(SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END), 0) AS active_doc_count,
      COALESCE(SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END), 0) AS trash_doc_count
     FROM documents WHERE user_id = ?`,
    userId
  );

  const folderStats = await db.get(
    `SELECT
      COALESCE(SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END), 0) AS active_folder_count,
      COALESCE(SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END), 0) AS trash_folder_count
     FROM folders WHERE user_id = ?`,
    userId
  );

  const activeBytes = Number(stats?.active_bytes || 0);
  const trashBytes = Number(stats?.trash_bytes || 0);
  const usedBytes = activeBytes + trashBytes;
  const quotaBytes = Number(user?.storage_quota_bytes || 0);

  if (user && Number(user.storage_used_bytes) !== usedBytes) {
    await db.run('UPDATE users SET storage_used_bytes = ? WHERE id = ?', usedBytes, userId);
  }

  const remainingBytes = Math.max(0, quotaBytes - usedBytes);
  const toMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));

  return {
    quotaBytes,
    usedBytes,
    remainingBytes,
    activeBytes,
    trashBytes,
    quotaMB: toMB(quotaBytes),
    usedMB: toMB(usedBytes),
    remainingMB: toMB(remainingBytes),
    activeMB: toMB(activeBytes),
    trashMB: toMB(trashBytes),
    percentUsed:
      quotaBytes > 0 ? Math.min(100, Number(((usedBytes / quotaBytes) * 100).toFixed(1))) : 0,
    activeDocCount: Number(stats?.active_doc_count || 0),
    trashDocCount: Number(stats?.trash_doc_count || 0),
    activeFolderCount: Number(folderStats?.active_folder_count || 0),
    trashFolderCount: Number(folderStats?.trash_folder_count || 0),
  };
}

export async function checkStorageQuota(db, userId, incomingDocBytes, existingDocBytes = 0) {
  const user = await db.get('SELECT storage_quota_bytes FROM users WHERE id = ?', userId);
  const currentTotalRow = await db.get(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM documents WHERE user_id = ?',
    userId
  );

  const currentTotal = Number(currentTotalRow?.total_bytes || 0);
  const quotaBytes = Number(user?.storage_quota_bytes || 0);
  const projectedBytes =
    currentTotal - Number(existingDocBytes || 0) + Number(incomingDocBytes || 0);

  return {
    allowed: projectedBytes <= quotaBytes,
    projectedBytes,
    quotaBytes,
    remainingAfter: Math.max(0, quotaBytes - projectedBytes),
  };
}
