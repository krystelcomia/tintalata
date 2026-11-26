export type UserRole = 'student' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'inactive';

export interface NotificationSettings {
  notifyAutoSave: boolean;
  notifyStorageAlerts: boolean;
  notifyShareAlerts: boolean;
  notifyPrivacyRequests: boolean;
  defaultDownloadFormat: 'docx' | 'pdf' | 'doc' | 'html' | 'txt';
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  studentNumber: string;
  courseSection: string;
  role: UserRole;
  status: AccountStatus;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  notificationSettings?: NotificationSettings;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface StorageSummary {
  quotaBytes: number;
  usedBytes: number;
  remainingBytes: number;
  activeBytes: number;
  trashBytes: number;
  quotaMB: number;
  usedMB: number;
  remainingMB: number;
  activeMB: number;
  trashMB: number;
  percentUsed: number;
  activeDocCount: number;
  trashDocCount: number;
  activeFolderCount: number;
  trashFolderCount: number;
}

export type FolderColor =
  | 'blue'
  | 'indigo'
  | 'sky'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'slate';

export type FolderIcon =
  | 'folder'
  | 'book'
  | 'graduation'
  | 'palette'
  | 'flask'
  | 'calculator'
  | 'star'
  | 'briefcase';

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  color: FolderColor;
  icon: FolderIcon;
  docCount: number;
  subfolderCount: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type DrawingTool =
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'circle'
  | 'triangle';

export interface DoodleStroke {
  tool: DrawingTool;
  color: string;
  width: number;
  opacity: number;
  points: Array<{ x: number; y: number }>;
}

export interface PageDoodleLayer {
  strokes: DoodleStroke[];
  dataUrl: string;
}

export interface DoodleItem {
  id: string;
  title: string;
  width: number;
  height: number;
  background: 'white' | 'transparent' | 'grid';
  strokes: DoodleStroke[];
  dataUrl: string;
  updatedAt: string;
}

export interface PageSettings {
  orientation: 'portrait' | 'landscape';
  margins: 'normal' | 'narrow' | 'wide';
  pageColor: string;
  lineHeight?: string;
}

export interface DocumentSummary {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  previewText: string;
  doodleCount: number;
  wordCount: number;
  sizeBytes: number;
  isFavorite: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sharedRole?: 'read' | 'read_write' | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
}

export interface DocumentFull extends DocumentSummary {
  contentHtml: string;
  doodles: DoodleItem[];
  pageDoodle: PageDoodleLayer;
  pageSettings: PageSettings;
  isNewDraft?: boolean;
}

export interface DocumentShareItem {
  id: string;
  permissionLevel: 'read' | 'read_write';
  recipientName: string;
  recipientEmail: string;
  createdAt: string;
}

export interface SharedByMeItem {
  shareId: string;
  documentId: string;
  title: string;
  permissionLevel: 'read' | 'read_write';
  recipientName: string;
  recipientEmail: string;
  sharedAt: string;
}

export interface TrashFolder {
  id: string;
  name: string;
  color: FolderColor;
  icon: FolderIcon;
  deletedAt: string;
  nestedDocCount: number;
  nestedFolderCount: number;
  nestedBytes: number;
}

export interface TrashDocument {
  id: string;
  title: string;
  originalFolderName: string | null;
  wordCount: number;
  sizeBytes: number;
  deletedAt: string;
}

export interface AccessGrant {
  id: string;
  studentId: string;
  adminId: string | null;
  adminName: string;
  permissionLevel: 'read' | 'read_write';
  status: 'pending' | 'approved' | 'denied' | 'revoked' | 'expired';
  reason: string;
  requestedByAdmin: boolean;
  expiresAt: string | null;
  createdAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  actorRole?: string;
  targetName?: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface AdminOverview {
  totalStudents: number;
  activeStudents: number;
  suspendedStudents: number;
  inactiveStudents: number;
  totalUsedMB: number;
  totalQuotaMB: number;
  totalActiveDocs: number;
  totalTrashDocs: number;
  authorizedStudentCount: number;
  pendingResetCount?: number;
}

export interface AdminStudent {
  id: string;
  email: string;
  fullName: string;
  studentNumber: string;
  courseSection: string;
  status: AccountStatus;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  storageQuotaMB: number;
  storageUsedMB: number;
  storageRemainingMB: number;
  activeDocCount: number;
  activeFolderCount: number;
  trashDocCount: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  linkedAdminId?: string | null;
  linkedAdminName?: string;
  linkedAdminEmail?: string;
  authorization: {
    state: 'none' | 'pending' | 'approved';
    grantId?: string;
    permissionLevel: 'read' | 'read_write' | null;
    expiresAt?: string | null;
    reason?: string;
    createdAt?: string;
  };
}

export type PasswordResetStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface PasswordResetRequest {
  id: string;
  userId: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  studentNumber: string;
  courseSection: string;
  reason: string;
  status: PasswordResetStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  completedAt?: string | null;
  resolvedAt: string | null;
  tokenExpiresAt?: string | null;
  tokenUsedAt?: string | null;
  tokenExpired?: boolean;
  emailDelivery?: {
    status: 'pending' | 'sent' | 'failed';
    emailType: string;
    provider?: string;
    error?: string | null;
    sentAt?: string | null;
  } | null;
}

export interface PasswordResetCounts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  completed: number;
}

export interface StudentNotification {
  id: string;
  resetRequestId: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}
