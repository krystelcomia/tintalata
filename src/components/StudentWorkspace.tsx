import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  FolderPlus,
  FilePlus2,
  Trash2,
  HardDrive,
  Search,
  Download,
  Pencil,
  ShieldCheck,
  LogOut,
  ChevronRight,
  FolderOpen,
  PenTool,
  ArrowLeft,
  Menu,
  User as UserIcon,
  Layers,
  X,
} from 'lucide-react';
import type {
  DocumentFull,
  DocumentSummary,
  DoodleItem,
  Folder,
  FolderColor,
  FolderIcon,
  PageSettings,
  StorageSummary,
  TrashDocument,
  TrashFolder,
  User,
} from '../types';
import { apiRequest, formatBytes, formatDateTimeTL, triggerDownload } from '../utils/api';
import { FolderIconBadge } from './FolderIconBadge';
import { FolderModal } from './FolderModal';
import { StorageModal } from './StorageModal';
import { PrivacyModal } from './PrivacyModal';
import { ProfileModal } from './ProfileModal';
import { WordEditor } from './WordEditor';
import { TrashView } from './TrashView';

interface StudentWorkspaceProps {
  currentUser: User;
  initialStorage: StorageSummary;
  initialPendingGrants: number;
  supportContext?: {
    studentId: string;
    studentName: string;
    permissionLevel: 'read' | 'read_write';
    onExitSupport: () => void;
  };
  onUserUpdated: (user: User) => void;
  onLogout: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type NavSection = 'all' | 'root' | 'folder' | 'trash';

export function StudentWorkspace({
  currentUser,
  initialStorage,
  initialPendingGrants,
  supportContext,
  onUserUpdated,
  onLogout,
  onNotify,
}: StudentWorkspaceProps) {
  const supportStudentId = supportContext?.studentId;
  const readOnly = supportContext ? supportContext.permissionLevel === 'read' : false;

  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [storage, setStorage] = useState<StorageSummary>(initialStorage);
  const [trashFolders, setTrashFolders] = useState<TrashFolder[]>([]);
  const [trashDocs, setTrashDocs] = useState<TrashDocument[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTrash, setLoadingTrash] = useState(false);

  const [navSection, setNavSection] = useState<NavSection>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Open document in WordEditor
  const [activeDoc, setActiveDoc] = useState<DocumentFull | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Modals & Mobile Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [pendingGrants, setPendingGrants] = useState(initialPendingGrants);

  const refreshWorkspace = async () => {
    setLoadingList(true);
    try {
      const [fRes, dRes, sRes, tRes] = await Promise.all([
        apiRequest<{ folders: Folder[] }>('/api/folders', { supportStudentId }),
        apiRequest<{ documents: DocumentSummary[] }>('/api/documents', { supportStudentId }),
        apiRequest<{ storage: StorageSummary }>('/api/storage', { supportStudentId }),
        apiRequest<{ folders: TrashFolder[]; documents: TrashDocument[] }>('/api/trash', {
          supportStudentId,
        }),
      ]);
      setFolders(fRes.folders);
      setDocuments(dRes.documents);
      setStorage(sRes.storage);
      setTrashFolders(tRes.folders);
      setTrashDocs(tRes.documents);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Hindi ma-load ang iyong mga file.'
      );
    } finally {
      setLoadingList(false);
    }
  };

  const refreshTrash = async () => {
    setLoadingTrash(true);
    try {
      const res = await apiRequest<{
        folders: TrashFolder[];
        documents: TrashDocument[];
        storage: StorageSummary;
      }>('/api/trash', { supportStudentId });
      setTrashFolders(res.folders);
      setTrashDocs(res.documents);
      setStorage(res.storage);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi ma-load ang Basurahan.');
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => {
    void refreshWorkspace();
  }, [supportStudentId]);

  const openDocumentById = async (docId: string) => {
    setLoadingDoc(true);
    try {
      const res = await apiRequest<{ document: DocumentFull }>(`/api/documents/${docId}`, {
        supportStudentId,
      });
      setActiveDoc(res.document);
      setSidebarOpen(false);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi mabuksan ang dokumento.');
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleCreateDocument = async (targetFolderId: string | null = null) => {
    if (readOnly) return;
    try {
      const res = await apiRequest<{
        document: DocumentFull;
        storage: StorageSummary;
        message: string;
      }>('/api/documents', {
        method: 'POST',
        supportStudentId,
        body: JSON.stringify({
          title: 'Bagong Dokumento',
          folderId: targetFolderId,
          contentHtml: '<p></p>',
          doodles: [],
        }),
      });
      setStorage(res.storage);
      setActiveDoc(res.document);
      setSidebarOpen(false);
      onNotify('success', res.message);
      await refreshWorkspace();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi magawa ang dokumento.');
    }
  };

  const handleSaveDocument = async (payload: {
    id: string;
    title: string;
    folderId: string | null;
    contentHtml: string;
    doodles: DoodleItem[];
    pageSettings: PageSettings;
  }) => {
    const res = await apiRequest<{ document: DocumentFull; storage: StorageSummary }>(
      `/api/documents/${payload.id}`,
      {
        method: 'PATCH',
        supportStudentId,
        body: JSON.stringify({
          title: payload.title,
          folderId: payload.folderId,
          contentHtml: payload.contentHtml,
          doodles: payload.doodles,
          pageSettings: payload.pageSettings,
        }),
      }
    );
    setActiveDoc(res.document);
    setStorage(res.storage);
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === res.document.id
          ? {
              ...d,
              title: res.document.title,
              folderId: res.document.folderId,
              folderName: res.document.folderName,
              previewText: res.document.previewText,
              doodleCount: res.document.doodleCount,
              wordCount: res.document.wordCount,
              sizeBytes: res.document.sizeBytes,
              updatedAt: res.document.updatedAt,
            }
          : d
      )
    );
  };

  const handleDeleteDocument = async (docId: string) => {
    if (readOnly) return;
    try {
      const res = await apiRequest<{ message: string; storage: StorageSummary }>(
        `/api/documents/${docId}`,
        { method: 'DELETE', supportStudentId }
      );
      if (activeDoc?.id === docId) {
        setActiveDoc(null);
      }
      setStorage(res.storage);
      onNotify('success', res.message);
      await refreshWorkspace();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi nabura ang dokumento.');
    }
  };

  const handleSaveFolder = async (payload: {
    id?: string;
    name: string;
    color: FolderColor;
    icon: FolderIcon;
    parentId: string | null;
  }) => {
    if (payload.id) {
      const res = await apiRequest<{ message: string }>(`/api/folders/${payload.id}`, {
        method: 'PATCH',
        supportStudentId,
        body: JSON.stringify(payload),
      });
      onNotify('success', res.message);
    } else {
      const res = await apiRequest<{ message: string }>('/api/folders', {
        method: 'POST',
        supportStudentId,
        body: JSON.stringify(payload),
      });
      onNotify('success', res.message);
    }
    await refreshWorkspace();
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (readOnly) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/folders/${folder.id}`, {
        method: 'DELETE',
        supportStudentId,
      });
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(null);
        setNavSection('all');
      }
      if (activeDoc?.folderId === folder.id) {
        setActiveDoc(null);
      }
      onNotify('success', res.message);
      await refreshWorkspace();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi nabura ang folder.');
    }
  };

  const handleDownloadFolder = async (folder: Folder) => {
    try {
      await triggerDownload(
        `/api/folders/${folder.id}/download?format=doc`,
        `${folder.name}.zip`,
        supportStudentId
      );
      onNotify('success', `Na-download ang folder na "${folder.name}" bilang ZIP.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pag-download ng folder.');
    }
  };

  // Trash actions
  const handleRestoreFolder = async (id: string) => {
    const res = await apiRequest<{ message: string; storage: StorageSummary }>(
      `/api/trash/folders/${id}/restore`,
      { method: 'POST', supportStudentId }
    );
    onNotify('success', res.message);
    await refreshWorkspace();
  };

  const handleRestoreDoc = async (id: string) => {
    const res = await apiRequest<{ message: string; storage: StorageSummary }>(
      `/api/trash/documents/${id}/restore`,
      { method: 'POST', supportStudentId }
    );
    onNotify('success', res.message);
    await refreshWorkspace();
  };

  const handlePermDeleteFolder = async (id: string) => {
    const res = await apiRequest<{ message: string; storage: StorageSummary }>(
      `/api/trash/folders/${id}`,
      { method: 'DELETE', supportStudentId }
    );
    onNotify('success', res.message);
    await refreshWorkspace();
  };

  const handlePermDeleteDoc = async (id: string) => {
    const res = await apiRequest<{ message: string; storage: StorageSummary }>(
      `/api/trash/documents/${id}`,
      { method: 'DELETE', supportStudentId }
    );
    onNotify('success', res.message);
    await refreshWorkspace();
  };

  const handleEmptyTrash = async () => {
    const res = await apiRequest<{ message: string; storage: StorageSummary }>('/api/trash', {
      method: 'DELETE',
      supportStudentId,
    });
    onNotify('success', res.message);
    await refreshWorkspace();
  };

  // Filtered documents & folders for current list view
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const activeFolder = selectedFolderId ? folderMap.get(selectedFolderId) || null : null;

  const breadcrumbs = useMemo(() => {
    const trail: Folder[] = [];
    let cur = activeFolder;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      trail.unshift(cur);
      cur = cur.parentId ? folderMap.get(cur.parentId) || null : null;
    }
    return trail;
  }, [activeFolder, folderMap]);

  const visibleFolders = useMemo(() => {
    if (navSection === 'trash' || navSection === 'root') return [];
    const targetParent = navSection === 'folder' ? selectedFolderId : null;
    const base =
      navSection === 'all' && !searchQuery.trim()
        ? folders.filter((f) => f.parentId === null)
        : folders.filter((f) => f.parentId === targetParent);
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, navSection, selectedFolderId, searchQuery]);

  const visibleDocuments = useMemo(() => {
    let list = documents;
    if (navSection === 'root') {
      list = list.filter((d) => d.folderId === null);
    } else if (navSection === 'folder' && selectedFolderId) {
      list = list.filter((d) => d.folderId === selectedFolderId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) || d.previewText.toLowerCase().includes(q)
      );
    }
    return list;
  }, [documents, navSection, selectedFolderId, searchQuery]);

  const trashTotalCount = trashFolders.length + trashDocs.length;

  // Build hierarchical tree for sidebar
  const renderFolderTree = (parentId: string | null = null, depth = 0) => {
    const children = folders.filter((f) => f.parentId === parentId);
    if (children.length === 0) return null;
    return children.map((folder) => {
      const isSelected = navSection === 'folder' && selectedFolderId === folder.id && !activeDoc;
      return (
        <div key={folder.id}>
          <div
            className={`group flex items-center justify-between gap-1 rounded-xl pr-1.5 py-1.5 text-xs transition ${
              isSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-blue-50'
            }`}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveDoc(null);
                setNavSection('folder');
                setSelectedFolderId(folder.id);
                setSidebarOpen(false);
              }}
              className="flex items-center gap-2 min-w-0 flex-1 text-left font-semibold"
            >
              <FolderIconBadge icon={folder.icon} color={folder.color} size="sm" />
              <span className="truncate">{folder.name}</span>
            </button>

            <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolder(folder);
                    setFolderModalOpen(true);
                  }}
                  title="I-edit ang folder"
                  className={`rounded-md p-1 ${
                    isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-blue-100 text-slate-600'
                  }`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDownloadFolder(folder)}
                title="I-download bilang ZIP"
                className={`rounded-md p-1 ${
                  isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-blue-100 text-blue-700'
                }`}
              >
                <Download className="h-3 w-3" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void handleDeleteFolder(folder)}
                  title="Ilipat sa Basurahan"
                  className={`rounded-md p-1 ${
                    isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-rose-100 text-rose-600'
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {renderFolderTree(folder.id, depth + 1)}
        </div>
      );
    });
  };

  const storageBarColor =
    storage.percentUsed >= 90
      ? 'bg-rose-500'
      : storage.percentUsed >= 75
        ? 'bg-amber-500'
        : 'bg-blue-600';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-blue-100">
      {/* Brand + User */}
      <div className="bg-gradient-to-br from-blue-800 to-blue-600 p-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-none">Tintalata</h1>
              <p className="text-[11px] text-blue-100 mt-0.5">Patnugot at Guhit</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-lg p-1 hover:bg-white/15"
            aria-label="Isara ang Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {supportContext ? (
          <div className="mt-3 rounded-xl bg-amber-400/20 border border-amber-200/40 p-2.5 text-xs">
            <p className="font-bold text-amber-100">Awtorisadong Suporta</p>
            <p className="text-[11px] text-white truncate">{supportContext.studentName}</p>
            <button
              type="button"
              onClick={supportContext.onExitSupport}
              className="mt-2 w-full rounded-lg bg-white text-blue-900 py-1 font-bold text-[11px] hover:bg-blue-50"
            >
              Bumalik sa Admin Dashboard
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 border border-white/15">
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-2 min-w-0 text-left hover:opacity-90"
            >
              <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{currentUser.fullName}</p>
                <p className="text-[10px] text-blue-100 truncate">
                  {currentUser.courseSection || currentUser.email}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(true)}
              title="Sentro ng Pagkapribado"
              className="relative rounded-lg bg-white/15 p-1.5 hover:bg-white/25 shrink-0"
            >
              <ShieldCheck className="h-4 w-4" />
              {pendingGrants > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 text-[10px] font-extrabold text-slate-900 flex items-center justify-center">
                  {pendingGrants}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      {!readOnly && (
        <div className="p-3 grid grid-cols-2 gap-2 border-b border-blue-50">
          <button
            type="button"
            onClick={() =>
              void handleCreateDocument(navSection === 'folder' ? selectedFolderId : null)
            }
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>Dokumento</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingFolder(null);
              setFolderModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Folder</span>
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => {
              setActiveDoc(null);
              setNavSection('all');
              setSelectedFolderId(null);
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
              navSection === 'all' && !activeDoc
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-blue-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Lahat ng Dokumento
            </span>
            <span className="text-[11px] opacity-80">{documents.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDoc(null);
              setNavSection('root');
              setSelectedFolderId(null);
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
              navSection === 'root' && !activeDoc
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-blue-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Pangunahing Lalagyan
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveDoc(null);
              setNavSection('trash');
              setSelectedFolderId(null);
              setSidebarOpen(false);
              void refreshTrash();
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
              navSection === 'trash' && !activeDoc
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-blue-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Basurahan
            </span>
            {trashTotalCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  navSection === 'trash' && !activeDoc
                    ? 'bg-white/25 text-white'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {trashTotalCount}
              </span>
            )}
          </button>
        </nav>

        {/* Customizable Folder Tree */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800">
              Mga Folder ({folders.length})
            </span>
          </div>
          {folders.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-slate-400">
              Wala pang folder. Gumawa ng isa upang maayos ang iyong mga file.
            </p>
          ) : (
            <div className="space-y-0.5">{renderFolderTree(null, 0)}</div>
          )}
        </div>
      </div>

      {/* Storage Tracker Widget */}
      <div className="border-t border-blue-100 p-3.5 bg-blue-50/40 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-blue-950">
            <HardDrive className="h-4 w-4 text-blue-600" />
            Storage
          </span>
          <span className="font-semibold text-slate-600">
            {storage.usedMB.toFixed(2)} / {storage.quotaMB.toFixed(0)} MB
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-blue-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${storageBarColor}`}
            style={{ width: `${Math.max(storage.usedBytes > 0 ? 3 : 0, storage.percentUsed)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Natitira: {storage.remainingMB.toFixed(2)} MB</span>
          <button
            type="button"
            onClick={() => setStorageModalOpen(true)}
            className="font-bold text-blue-700 hover:underline"
          >
            Pamahalaan
          </button>
        </div>

        {!supportContext && (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Mag-log out
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f4f8ff]">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-72 shrink-0 h-full">{sidebarContent}</aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[85vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {loadingDoc ? (
          <div className="flex-1 flex items-center justify-center text-sm font-semibold text-blue-700">
            Binubuksan ang dokumento...
          </div>
        ) : activeDoc ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="no-print bg-blue-50/90 border-b border-blue-100 px-4 py-1.5 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setActiveDoc(null)}
                className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Bumalik sa Mga File
              </button>
              <span className="text-[11px] text-slate-500">
                Huling binago: {formatDateTimeTL(activeDoc.updatedAt)}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <WordEditor
                document={activeDoc}
                folders={folders}
                readOnly={readOnly}
                supportStudentId={supportStudentId}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSaveDocument={handleSaveDocument}
                onDeleteDocument={handleDeleteDocument}
                onNotify={onNotify}
              />
            </div>
          </div>
        ) : navSection === 'trash' ? (
          <TrashView
            folders={trashFolders}
            documents={trashDocs}
            loading={loadingTrash}
            readOnly={readOnly}
            onOpenSidebar={() => setSidebarOpen(true)}
            onRestoreFolder={handleRestoreFolder}
            onRestoreDocument={handleRestoreDoc}
            onPermanentDeleteFolder={handlePermDeleteFolder}
            onPermanentDeleteDocument={handlePermDeleteDoc}
            onEmptyTrash={handleEmptyTrash}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Workspace Top Bar */}
            <header className="border-b border-blue-100 bg-white px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Buksan ang Sidebar"
                  className="lg:hidden rounded-xl border border-blue-100 bg-blue-50 p-2 text-blue-700"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1.5 text-sm sm:text-base font-extrabold text-slate-900 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setNavSection('all');
                        setSelectedFolderId(null);
                      }}
                      className="hover:text-blue-700"
                    >
                      {navSection === 'root' ? 'Pangunahing Lalagyan' : 'Aking mga File'}
                    </button>
                    {breadcrumbs.map((b) => (
                      <span key={b.id} className="flex items-center gap-1.5">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                        <button
                          type="button"
                          onClick={() => {
                            setNavSection('folder');
                            setSelectedFolderId(b.id);
                          }}
                          className="text-blue-700 hover:underline"
                        >
                          {b.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {visibleFolders.length} folder • {visibleDocuments.length} dokumento •{' '}
                    Natitirang storage: <strong>{storage.remainingMB.toFixed(2)} MB</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Maghanap ng dokumento o folder..."
                    className="w-full rounded-xl border border-blue-200 bg-blue-50/40 pl-9 pr-3 py-2 text-xs font-medium focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateDocument(
                        navSection === 'folder' ? selectedFolderId : null
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Bagong Dokumento
                  </button>
                )}
              </div>
            </header>

            {/* Files & Folders Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {loadingList ? (
                <div className="rounded-2xl border border-blue-100 bg-white p-10 text-center text-sm text-slate-500">
                  Kinukuha ang iyong mga dokumento at folder...
                </div>
              ) : (
                <>
                  {/* Folders Section */}
                  {visibleFolders.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                        Mga Folder ({visibleFolders.length})
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                        {visibleFolders.map((folder) => (
                          <div
                            key={folder.id}
                            className="group rounded-2xl border border-blue-100 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-md transition flex flex-col justify-between gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setNavSection('folder');
                                setSelectedFolderId(folder.id);
                              }}
                              className="flex items-start gap-3 text-left w-full"
                            >
                              <FolderIconBadge icon={folder.icon} color={folder.color} size="md" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700">
                                  {folder.name}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {folder.docCount} dokumento • {folder.subfolderCount} subfolder
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Laki: {formatBytes(folder.totalBytes)}
                                </p>
                              </div>
                            </button>

                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFolder(folder);
                                    setFolderModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                                >
                                  <Pencil className="h-3 w-3" />
                                  I-edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDownloadFolder(folder)}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                <Download className="h-3 w-3" />
                                I-download (.zip)
                              </button>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteFolder(folder)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Burahin
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Documents Section */}
                  <section className="space-y-3">
                    <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                      Mga Dokumento ({visibleDocuments.length})
                    </h2>
                    {visibleDocuments.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-blue-200 bg-white p-10 text-center">
                        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <FileText className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Wala pang dokumento rito
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Gumawa ng bagong dokumento upang magsimulang magsulat o gumuhit ng doodle.
                        </p>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCreateDocument(
                                navSection === 'folder' ? selectedFolderId : null
                              )
                            }
                            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                          >
                            <FilePlus2 className="h-4 w-4" />
                            Gumawa ng Unang Dokumento
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {visibleDocuments.map((doc) => (
                          <div
                            key={doc.id}
                            className="group rounded-2xl border border-blue-100 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-md transition flex flex-col justify-between gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => void openDocumentById(doc.id)}
                              className="text-left space-y-2 w-full"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700">
                                      {doc.title}
                                    </h3>
                                    <p className="text-[11px] text-slate-400 truncate">
                                      {doc.folderName || 'Pangunahing Lalagyan'}
                                    </p>
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                  {formatBytes(doc.sizeBytes)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-600 line-clamp-2 min-h-[32px]">
                                {doc.previewText || 'Walang lamang teksto pa...'}
                              </p>

                              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                <span>{doc.wordCount} salita</span>
                                {doc.doodleCount > 0 && (
                                  <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                                    <PenTool className="h-3 w-3" />
                                    {doc.doodleCount} guhit
                                  </span>
                                )}
                                <span className="ml-auto">{formatDateTimeTL(doc.updatedAt)}</span>
                              </div>
                            </button>

                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => void openDocumentById(doc.id)}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Pencil className="h-3 w-3" />
                                {readOnly ? 'Buksan' : 'I-edit'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void triggerDownload(
                                    `/api/documents/${doc.id}/download?format=doc`,
                                    `${doc.title}.doc`,
                                    supportStudentId
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                <Download className="h-3 w-3" />
                                I-download
                              </button>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDocument(doc.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Burahin
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <FolderModal
        isOpen={folderModalOpen}
        editingFolder={editingFolder}
        defaultParentId={navSection === 'folder' ? selectedFolderId : null}
        allFolders={folders}
        onClose={() => {
          setFolderModalOpen(false);
          setEditingFolder(null);
        }}
        onSubmit={handleSaveFolder}
      />

      <StorageModal
        isOpen={storageModalOpen}
        storage={storage}
        supportStudentId={supportStudentId}
        onClose={() => setStorageModalOpen(false)}
        onOpenDocument={(id) => void openDocumentById(id)}
        onOpenTrash={() => {
          setActiveDoc(null);
          setNavSection('trash');
          void refreshTrash();
        }}
      />

      {!supportContext && (
        <>
          <PrivacyModal
            isOpen={privacyModalOpen}
            onClose={() => setPrivacyModalOpen(false)}
            onNotify={onNotify}
            onPendingCountChange={setPendingGrants}
          />
          <ProfileModal
            isOpen={profileModalOpen}
            user={currentUser}
            onClose={() => setProfileModalOpen(false)}
            onUpdated={(updated, msg) => {
              onUserUpdated(updated);
              onNotify('success', msg);
            }}
          />
        </>
      )}
    </div>
  );
}
