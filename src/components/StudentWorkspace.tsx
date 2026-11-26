import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Home,
  FileText,
  FolderPlus,
  FilePlus2,
  Folder,
  Clock,
  Star,
  Share2,
  Trash2,
  Search,
  Download,
  Pencil,
  ShieldCheck,
  ChevronRight,
  PenTool,
  ArrowLeft,
  Menu,
  User as UserIcon,
  X,
  Brush,
  ArrowUpDown,
  Save,
  AlertTriangle,
} from 'lucide-react';
import type {
  DocumentFull,
  DocumentSummary,
  DoodleItem,
  Folder as FolderType,
  FolderColor,
  FolderIcon,
  PageDoodleLayer,
  PageSettings,
  SharedByMeItem,
  StorageSummary,
  TrashDocument,
  TrashFolder,
  User,
} from '../types';
import { apiRequest, formatBytes, formatDateTimeTL, triggerDownload } from '../utils/api';
import { FolderIconBadge } from './FolderIconBadge';
import { FolderModal } from './FolderModal';
import { WordEditor } from './WordEditor';
import { TrashView } from './TrashView';
import { StoragePageView } from './StoragePageView';
import { PrivacyPageView } from './PrivacyPageView';
import { ProfilePageView } from './ProfilePageView';
import { TintalataLogo } from './TintalataLogo';
import { ShareModal } from './ShareModal';

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

type NavSection =
  | 'home'
  | 'documents'
  | 'folders'
  | 'folder'
  | 'recent'
  | 'favorites'
  | 'shared'
  | 'trash'
  | 'storage'
  | 'privacy'
  | 'profile';

type SortOption = 'updated' | 'opened' | 'created' | 'title' | 'size';

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
  const defaultDlFormat = currentUser.notificationSettings?.defaultDownloadFormat || 'docx';

  const [folders, setFolders] = useState<FolderType[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<DocumentSummary[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedByMeItem[]>([]);
  const [storage, setStorage] = useState<StorageSummary>(initialStorage);
  const [trashFolders, setTrashFolders] = useState<TrashFolder[]>([]);
  const [trashDocs, setTrashDocs] = useState<TrashDocument[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTrash, setLoadingTrash] = useState(false);

  const [navSection, setNavSection] = useState<NavSection>('home');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  // Open document in WordEditor
  const [activeDoc, setActiveDoc] = useState<DocumentFull | null>(null);
  const [openInDrawMode, setOpenInDrawMode] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editorHasUnsaved, setEditorHasUnsaved] = useState(false);
  const editorSaveFnRef = useRef<(() => Promise<boolean>) | null>(null);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false);

  const registerEditorSaveHandler = useCallback((fn: (() => Promise<boolean>) | null) => {
    editorSaveFnRef.current = fn;
  }, []);

  const attemptLeaveEditor = (nextAction: () => void) => {
    const canEditActive = Boolean(activeDoc && !readOnly && activeDoc.sharedRole !== 'read');
    if (canEditActive && editorHasUnsaved) {
      setPendingLeaveAction(() => nextAction);
      return;
    }
    nextAction();
  };

  // Modals & Drawers
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [shareDocTarget, setShareDocTarget] = useState<DocumentSummary | null>(null);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<
    | { type: 'document'; id: string; label: string; isDraft?: boolean }
    | { type: 'folder'; folder: FolderType; label: string }
    | null
  >(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const [pendingGrants, setPendingGrants] = useState(initialPendingGrants);

  const refreshWorkspace = async () => {
    setLoadingList(true);
    try {
      const [fRes, dRes, sRes, tRes, shRes] = await Promise.all([
        apiRequest<{ folders: FolderType[] }>('/api/folders', { supportStudentId }),
        apiRequest<{ documents: DocumentSummary[] }>('/api/documents', { supportStudentId }),
        apiRequest<{ storage: StorageSummary }>('/api/storage', { supportStudentId }),
        apiRequest<{ folders: TrashFolder[]; documents: TrashDocument[] }>('/api/trash', {
          supportStudentId,
        }),
        !supportStudentId && currentUser.role === 'student'
          ? apiRequest<{ sharedWithMe: DocumentSummary[]; sharedByMe: SharedByMeItem[] }>(
              '/api/documents/shared/list'
            )
          : Promise.resolve({ sharedWithMe: [], sharedByMe: [] }),
      ]);
      setFolders(fRes.folders);
      setDocuments(dRes.documents);
      setStorage(sRes.storage);
      setTrashFolders(tRes.folders);
      setTrashDocs(tRes.documents);
      setSharedWithMe(shRes.sharedWithMe);
      setSharedByMe(shRes.sharedByMe);
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

  const openDocumentById = async (docId: string, startDrawMode = false) => {
    setLoadingDoc(true);
    try {
      const res = await apiRequest<{ document: DocumentFull; permission?: 'read' | 'read_write' }>(
        `/api/documents/${docId}`,
        { supportStudentId }
      );
      setOpenInDrawMode(startDrawMode);
      setActiveDoc(res.document);
      setSidebarOpen(false);
      // Update lastOpenedAt locally for Recent list
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === res.document.id ? { ...d, lastOpenedAt: res.document.lastOpenedAt } : d
        )
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi mabuksan ang dokumento.');
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleCreateDocument = (
    targetFolderId: string | null = null,
    startInDrawMode = false
  ) => {
    if (readOnly) return;
    attemptLeaveEditor(() => {
      const nowIso = new Date().toISOString();
      const draftFolderName = targetFolderId ? folderMap.get(targetFolderId)?.name || null : null;
      const draftDoc: DocumentFull = {
        id: `__draft__${Date.now()}`,
        isNewDraft: true,
        folderId: targetFolderId,
        folderName: draftFolderName,
        title: startInDrawMode ? 'Bagong Guhit at Doodle' : 'Bagong Dokumento',
        previewText: '',
        doodleCount: 0,
        wordCount: 0,
        sizeBytes: 0,
        isFavorite: false,
        lastOpenedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        contentHtml: startInDrawMode ? '<h2>Aking Guhit</h2><p></p>' : '<p></p>',
        doodles: [],
        pageDoodle: { strokes: [], dataUrl: '' },
        pageSettings: {
          orientation: 'portrait',
          margins: 'normal',
          pageColor: '#ffffff',
          lineHeight: '1.6',
        },
      };
      setOpenInDrawMode(startInDrawMode);
      setActiveDoc(draftDoc);
      setEditorHasUnsaved(true);
      setSidebarOpen(false);
    });
  };

  const handleSaveDocument = async (payload: {
    id: string;
    title: string;
    folderId: string | null;
    contentHtml: string;
    doodles: DoodleItem[];
    pageDoodle: PageDoodleLayer;
    pageSettings: PageSettings;
    isFavorite: boolean;
  }) => {
    const isDraft = payload.id.startsWith('__draft__');
    const res = isDraft
      ? await apiRequest<{ document: DocumentFull; storage: StorageSummary; message?: string }>(
          '/api/documents',
          {
            method: 'POST',
            supportStudentId,
            body: JSON.stringify({
              title: payload.title,
              folderId: payload.folderId,
              contentHtml: payload.contentHtml,
              doodles: payload.doodles,
              pageDoodle: payload.pageDoodle,
              pageSettings: payload.pageSettings,
              isFavorite: payload.isFavorite,
            }),
          }
        )
      : await apiRequest<{ document: DocumentFull; storage: StorageSummary }>(
          `/api/documents/${payload.id}`,
          {
            method: 'PATCH',
            supportStudentId,
            body: JSON.stringify({
              title: payload.title,
              folderId: payload.folderId,
              contentHtml: payload.contentHtml,
              doodles: payload.doodles,
              pageDoodle: payload.pageDoodle,
              pageSettings: payload.pageSettings,
              isFavorite: payload.isFavorite,
            }),
          }
        );
    setActiveDoc(res.document);
    setEditorHasUnsaved(false);
    setStorage(res.storage);
    const summaryItem: DocumentSummary = {
      id: res.document.id,
      title: res.document.title,
      folderId: res.document.folderId,
      folderName: res.document.folderName,
      previewText: res.document.previewText,
      doodleCount: res.document.doodleCount,
      wordCount: res.document.wordCount,
      sizeBytes: res.document.sizeBytes,
      isFavorite: res.document.isFavorite,
      lastOpenedAt: res.document.lastOpenedAt,
      createdAt: res.document.createdAt,
      updatedAt: res.document.updatedAt,
    };
    setDocuments((prev) =>
      isDraft
        ? [summaryItem, ...prev.filter((d) => d.id !== res.document.id)]
        : prev.map((d) => (d.id === res.document.id ? { ...d, ...summaryItem } : d))
    );
    void refreshWorkspace();
  };

  const handleToggleFavorite = async (doc: DocumentSummary) => {
    if (readOnly) return;
    try {
      const nextFav = !doc.isFavorite;
      await apiRequest(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        supportStudentId,
        body: JSON.stringify({ isFavorite: nextFav }),
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, isFavorite: nextFav } : d))
      );
      onNotify(
        'info',
        nextFav
          ? `Idinagdag sa Mga Paborito ang "${doc.title}".`
          : `Inalis sa Mga Paborito ang "${doc.title}".`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi ma-update ang paborito.');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const res = await apiRequest<{ document: DocumentFull; message: string }>(
        `/api/documents/${renameTarget.id}`,
        {
          method: 'PATCH',
          supportStudentId,
          body: JSON.stringify({ title: renameValue.trim() }),
        }
      );
      setDocuments((prev) =>
        prev.map((d) => (d.id === renameTarget.id ? { ...d, title: res.document.title } : d))
      );
      onNotify('success', 'Napalitan na ang pangalan ng dokumento.');
      setRenameTarget(null);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi napalitan ang pangalan.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (readOnly) return;
    const isDraft = docId.startsWith('__draft__');
    const targetTitle =
      (activeDoc?.id === docId ? activeDoc.title : documents.find((d) => d.id === docId)?.title) ||
      'Walang Pamagat na Dokumento';
    setPendingDeleteTarget({
      type: 'document',
      id: docId,
      label: targetTitle,
      isDraft,
    });
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

  const handleDeleteFolder = (folder: FolderType) => {
    if (readOnly) return;
    setPendingDeleteTarget({
      type: 'folder',
      folder,
      label: folder.name,
    });
  };

  const executeConfirmedDelete = async () => {
    if (!pendingDeleteTarget || readOnly) return;
    setDeletingItem(true);
    try {
      if (pendingDeleteTarget.type === 'document') {
        if (pendingDeleteTarget.isDraft) {
          setActiveDoc(null);
          setEditorHasUnsaved(false);
          setPendingDeleteTarget(null);
          onNotify('info', 'Isinara ang bagong draft nang hindi sine-save.');
          return;
        }
        const res = await apiRequest<{ message: string; storage: StorageSummary }>(
          `/api/documents/${pendingDeleteTarget.id}`,
          { method: 'DELETE', supportStudentId }
        );
        if (activeDoc?.id === pendingDeleteTarget.id) {
          setActiveDoc(null);
          setEditorHasUnsaved(false);
        }
        setStorage(res.storage);
        setPendingDeleteTarget(null);
        onNotify('success', res.message);
        await refreshWorkspace();
      } else {
        const folder = pendingDeleteTarget.folder;
        const res = await apiRequest<{ message: string }>(`/api/folders/${folder.id}`, {
          method: 'DELETE',
          supportStudentId,
        });
        if (selectedFolderId === folder.id) {
          setSelectedFolderId(null);
          setNavSection('folders');
        }
        if (activeDoc?.folderId === folder.id) {
          setActiveDoc(null);
          setEditorHasUnsaved(false);
        }
        setPendingDeleteTarget(null);
        onNotify('success', res.message);
        await refreshWorkspace();
      }
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error
          ? err.message
          : pendingDeleteTarget.type === 'folder'
            ? 'Hindi nabura ang folder.'
            : 'Hindi nabura ang dokumento.'
      );
    } finally {
      setDeletingItem(false);
    }
  };

  const handleDownloadFolder = async (folder: FolderType) => {
    try {
      await triggerDownload(
        `/api/folders/${folder.id}/download?format=${defaultDlFormat}`,
        `${folder.name}.zip`,
        supportStudentId
      );
      onNotify('success', `Na-download ang folder na "${folder.name}" bilang ZIP.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pag-download ng folder.');
    }
  };

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

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const activeFolder = selectedFolderId ? folderMap.get(selectedFolderId) || null : null;

  const breadcrumbs = useMemo(() => {
    const trail: FolderType[] = [];
    let cur = activeFolder;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      trail.unshift(cur);
      cur = cur.parentId ? folderMap.get(cur.parentId) || null : null;
    }
    return trail;
  }, [activeFolder, folderMap]);

  const recentlyOpenedDocs = useMemo(
    () =>
      [...documents]
        .sort(
          (a, b) =>
            new Date(b.lastOpenedAt || b.updatedAt).getTime() -
            new Date(a.lastOpenedAt || a.updatedAt).getTime()
        )
        .slice(0, 4),
    [documents]
  );

  const recentlyCreatedDocs = useMemo(
    () =>
      [...documents]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [documents]
  );

  const favoriteDocs = useMemo(() => documents.filter((d) => d.isFavorite), [documents]);

  const visibleFolders = useMemo(() => {
    if (navSection === 'folders') {
      const q = searchQuery.toLowerCase().trim();
      return q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders;
    }
    if (navSection === 'folder') {
      return folders.filter((f) => f.parentId === selectedFolderId);
    }
    return [];
  }, [folders, navSection, selectedFolderId, searchQuery]);

  const visibleDocuments = useMemo(() => {
    let list =
      navSection === 'shared'
        ? sharedWithMe
        : navSection === 'favorites'
          ? favoriteDocs
          : documents;

    if (navSection === 'folder' && selectedFolderId) {
      list = list.filter((d) => d.folderId === selectedFolderId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) => d.title.toLowerCase().includes(q) || d.previewText.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    if (sortBy === 'opened' || navSection === 'recent') {
      sorted.sort(
        (a, b) =>
          new Date(b.lastOpenedAt || b.updatedAt).getTime() -
          new Date(a.lastOpenedAt || a.updatedAt).getTime()
      );
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'fil'));
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else {
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    return sorted;
  }, [
    documents,
    sharedWithMe,
    favoriteDocs,
    navSection,
    selectedFolderId,
    searchQuery,
    sortBy,
  ]);

  const trashTotalCount = trashFolders.length + trashDocs.length;

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
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('folder');
                  setSelectedFolderId(folder.id);
                  setSidebarOpen(false);
                })
              }
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

  const navItemClass = (active: boolean) =>
    `w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
      active ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:bg-blue-50'
    }`;

  const renderDocCard = (doc: DocumentSummary) => {
    const isSharedDoc = Boolean(doc.sharedRole);
    const canEdit = !readOnly && (!isSharedDoc || doc.sharedRole === 'read_write');
    return (
      <div
        key={doc.id}
        className="group rounded-2xl border border-blue-100 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-md transition flex flex-col justify-between gap-3"
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => void openDocumentById(doc.id)}
              className="flex items-center gap-2.5 min-w-0 text-left flex-1"
            >
              <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700">
                  {doc.title}
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  {isSharedDoc
                    ? `Mula kay ${doc.ownerName}`
                    : doc.folderName || 'Pangunahing Lalagyan'}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {!isSharedDoc && !readOnly && (
                <button
                  type="button"
                  onClick={() => void handleToggleFavorite(doc)}
                  title={doc.isFavorite ? 'Alisin sa Paborito' : 'Idagdag sa Paborito'}
                  className="rounded-lg p-1 hover:bg-amber-50 text-slate-300 hover:text-amber-500"
                >
                  <Star
                    className={`h-4 w-4 ${doc.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`}
                  />
                </button>
              )}
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                {formatBytes(doc.sizeBytes)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openDocumentById(doc.id)}
            className="text-left w-full space-y-2"
          >
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => void openDocumentById(doc.id)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            <Pencil className="h-3 w-3" />
            {canEdit ? 'I-edit' : 'Buksan'}
          </button>

          {!isSharedDoc && !readOnly && (
            <button
              type="button"
              onClick={() => {
                setRenameTarget(doc);
                setRenameValue(doc.title);
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            >
              Pangalanan
            </button>
          )}

          {!isSharedDoc && !readOnly && !supportStudentId && (
            <button
              type="button"
              onClick={() => setShareDocTarget(doc)}
              title="Ibahagi"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Share2 className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              void triggerDownload(
                `/api/documents/${doc.id}/download?format=${defaultDlFormat}`,
                `${doc.title}.${defaultDlFormat}`,
                supportStudentId
              )
            }
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Download className="h-3 w-3" />
            .{defaultDlFormat}
          </button>

          {!isSharedDoc && !readOnly && (
            <button
              type="button"
              onClick={() => void handleDeleteDocument(doc.id)}
              title="Ilipat sa Basurahan"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="bg-gradient-to-b from-blue-800 via-blue-700 to-blue-600 px-4 py-4 min-h-[76px] flex flex-col justify-center text-white border-b border-blue-700/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <TintalataLogo size="sm" variant="light" />
            <div>
              <h1 className="text-base font-extrabold leading-none">Tintalata</h1>
              <p className="text-[11px] text-blue-100 mt-0.5">Workspace ng Mag-aaral</p>
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
      </div>

      {!readOnly && (
        <div className="p-3 grid grid-cols-2 gap-2 border-b border-r border-blue-100">
          <button
            type="button"
            onClick={() =>
              void handleCreateDocument(navSection === 'folder' ? selectedFolderId : null, false)
            }
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>Dokumento</span>
          </button>
          <button
            type="button"
            onClick={() =>
              void handleCreateDocument(navSection === 'folder' ? selectedFolderId : null, true)
            }
            className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
          >
            <Brush className="h-4 w-4" />
            <span>Guhit</span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-5 border-r border-blue-100">
        <div>
          <p className="px-2 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
            Nabigasyon
          </p>
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('home');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                })
              }
              className={navItemClass(navSection === 'home' && !activeDoc)}
            >
              <span className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Tahanan
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('documents');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                })
              }
              className={navItemClass(navSection === 'documents' && !activeDoc)}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Mga Dokumento Ko
              </span>
              <span className="text-[11px] opacity-80">{documents.length}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('folders');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                })
              }
              className={navItemClass(navSection === 'folders' && !activeDoc)}
            >
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Mga Folder Ko
              </span>
              <span className="text-[11px] opacity-80">{folders.length}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('recent');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                })
              }
              className={navItemClass(navSection === 'recent' && !activeDoc)}
            >
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Mga Kamakailang File
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('favorites');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                })
              }
              className={navItemClass(navSection === 'favorites' && !activeDoc)}
            >
              <span className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Mga Paborito
              </span>
              {favoriteDocs.length > 0 && (
                <span className="text-[11px] opacity-80">{favoriteDocs.length}</span>
              )}
            </button>

            {!supportContext && (
              <button
                type="button"
                onClick={() =>
                  attemptLeaveEditor(() => {
                    setActiveDoc(null);
                    setEditorHasUnsaved(false);
                    setNavSection('shared');
                    setSelectedFolderId(null);
                    setSidebarOpen(false);
                  })
                }
                className={navItemClass(navSection === 'shared' && !activeDoc)}
              >
                <span className="flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  Mga Ibinahaging Dokumento
                </span>
                {sharedWithMe.length > 0 && (
                  <span className="text-[11px] opacity-80">{sharedWithMe.length}</span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('trash');
                  setSelectedFolderId(null);
                  setSidebarOpen(false);
                  void refreshTrash();
                })
              }
              className={navItemClass(navSection === 'trash' && !activeDoc)}
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
        </div>

        {/* Folder Tree with Quick New Folder */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
              Mga Folder ({folders.length})
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setFolderModalOpen(true);
                }}
                title="Gumawa ng Bagong Folder"
                className="rounded-md p-1 text-blue-700 hover:bg-blue-50"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {folders.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-slate-400">
              Wala pang folder. Pindutin ang + upang gumawa.
            </p>
          ) : (
            <div className="space-y-0.5">{renderFolderTree(null, 0)}</div>
          )}
        </div>

        {/* Settings & Security */}
        {!supportContext && (
          <div>
            <p className="px-2 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
              Account at Seguridad
            </p>
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() =>
                  attemptLeaveEditor(() => {
                    setActiveDoc(null);
                    setEditorHasUnsaved(false);
                    setNavSection('privacy');
                    setSidebarOpen(false);
                  })
                }
                className={navItemClass(navSection === 'privacy' && !activeDoc)}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Pagkapribado
                </span>
                {pendingGrants > 0 && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                    {pendingGrants}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  attemptLeaveEditor(() => {
                    setActiveDoc(null);
                    setEditorHasUnsaved(false);
                    setNavSection('profile');
                    setSidebarOpen(false);
                  })
                }
                className={navItemClass(
                  (navSection === 'profile' || navSection === 'storage') && !activeDoc
                )}
              >
                <span className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Profile at Mga Setting
                </span>
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Bottom Profile & Course/Section Card */}
      <div className="border-t border-r border-blue-100 p-3.5 bg-blue-50/40">
        {supportContext ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs space-y-2">
            <div>
              <p className="font-bold text-amber-900">Awtorisadong Suporta</p>
              <p className="text-[11px] text-amber-800 truncate">{supportContext.studentName}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                attemptLeaveEditor(() => {
                  setActiveDoc(null);
                  setEditorHasUnsaved(false);
                  setNavSection('storage');
                  setSidebarOpen(false);
                })
              }
              className="w-full rounded-lg border border-blue-200 bg-white py-1.5 font-bold text-[11px] text-blue-700 hover:bg-blue-50"
            >
              Tingnan ang Storage ({storage.usedMB.toFixed(2)} / {storage.quotaMB.toFixed(0)} MB)
            </button>
            <button
              type="button"
              onClick={() => attemptLeaveEditor(supportContext.onExitSupport)}
              className="w-full rounded-lg bg-blue-700 text-white py-1.5 font-bold text-[11px] hover:bg-blue-800"
            >
              Bumalik sa Admin Dashboard
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              attemptLeaveEditor(() => {
                setActiveDoc(null);
                setEditorHasUnsaved(false);
                setNavSection('profile');
                setSidebarOpen(false);
              })
            }
            className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 border text-left transition ${
              (navSection === 'profile' || navSection === 'storage') && !activeDoc
                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                : 'bg-white border-blue-100 hover:bg-blue-50 text-slate-900'
            }`}
          >
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                (navSection === 'profile' || navSection === 'storage') && !activeDoc
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate">{currentUser.fullName}</p>
              <p
                className={`text-[11px] truncate ${
                  (navSection === 'profile' || navSection === 'storage') && !activeDoc
                    ? 'text-blue-100'
                    : 'text-slate-500'
                }`}
              >
                {currentUser.courseSection || currentUser.email}
              </p>
            </div>
          </button>
        )}
      </div>
    </div>
  );

  const sectionHeaderTitle = () => {
    switch (navSection) {
      case 'home':
        return `Maligayang Pagdating, ${currentUser.fullName}`;
      case 'documents':
        return 'Mga Dokumento Ko';
      case 'folders':
        return 'Mga Folder Ko';
      case 'recent':
        return 'Mga Kamakailang File';
      case 'favorites':
        return 'Mga Paboritong Dokumento';
      case 'shared':
        return 'Mga Ibinahaging Dokumento';
      default:
        return 'Mga Dokumento';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f8ff]">
      <aside className="no-print hidden lg:block w-72 shrink-0 h-full">{sidebarContent}</aside>

      {sidebarOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-72 max-w-[85vw] h-full">{sidebarContent}</aside>
        </div>
      )}

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
                onClick={() =>
                  attemptLeaveEditor(() => {
                    setActiveDoc(null);
                    setEditorHasUnsaved(false);
                  })
                }
                className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Bumalik sa Workspace
              </button>
              <span className="text-[11px] text-slate-500">
                {activeDoc.isNewDraft
                  ? 'Bagong draft • Hindi pa nai-save'
                  : editorHasUnsaved
                    ? 'May mga hindi pa nai-save na pagbabago'
                    : `Huling binago: ${formatDateTimeTL(activeDoc.updatedAt)}`}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <WordEditor
                document={activeDoc}
                folders={folders}
                initialDrawMode={openInDrawMode}
                readOnly={readOnly || activeDoc.sharedRole === 'read'}
                isOwner={!activeDoc.sharedRole}
                supportStudentId={supportStudentId}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSaveDocument={handleSaveDocument}
                onDeleteDocument={handleDeleteDocument}
                onNotify={onNotify}
                onSharesChanged={() => void refreshWorkspace()}
                onDirtyChange={setEditorHasUnsaved}
                registerSaveHandler={registerEditorSaveHandler}
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
        ) : navSection === 'storage' ? (
          <StoragePageView
            storage={storage}
            supportStudentId={supportStudentId}
            onOpenSidebar={() => setSidebarOpen(true)}
            onBackToProfile={!supportContext ? () => setNavSection('profile') : undefined}
            onOpenDocument={(id) => void openDocumentById(id)}
            onOpenTrash={() => {
              setNavSection('trash');
              void refreshTrash();
            }}
            onStorageSynced={setStorage}
          />
        ) : navSection === 'privacy' && !supportContext ? (
          <PrivacyPageView
            onOpenSidebar={() => setSidebarOpen(true)}
            onNotify={onNotify}
            onPendingCountChange={setPendingGrants}
          />
        ) : navSection === 'profile' && !supportContext ? (
          <ProfilePageView
            user={currentUser}
            storage={storage}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenStorage={() => setNavSection('storage')}
            onUpdated={(updated, msg) => {
              onUserUpdated(updated);
              onNotify('success', msg);
            }}
            onLogout={onLogout}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top Workspace Header */}
            <header className="bg-gradient-to-b from-blue-800 via-blue-700 to-blue-600 border-b border-blue-700/50 px-5 sm:px-6 py-4 min-h-[76px] flex flex-wrap items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Buksan ang Sidebar"
                  className="lg:hidden rounded-xl border border-white/25 bg-white/15 p-2 text-white hover:bg-white/25"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  {navSection === 'folder' ? (
                    <div className="flex items-center gap-1.5 text-base sm:text-lg font-extrabold text-white flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setNavSection('folders');
                          setSelectedFolderId(null);
                        }}
                        className="hover:text-blue-100"
                      >
                        Mga Folder Ko
                      </button>
                      {breadcrumbs.map((b) => (
                        <span key={b.id} className="flex items-center gap-1.5">
                          <ChevronRight className="h-4 w-4 text-blue-200" />
                          <button
                            type="button"
                            onClick={() => {
                              setNavSection('folder');
                              setSelectedFolderId(b.id);
                            }}
                            className="text-blue-100 hover:text-white hover:underline"
                          >
                            {b.name}
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                      {sectionHeaderTitle()}
                    </h2>
                  )}
                  <p className="text-xs text-blue-100 mt-0.5">
                    {documents.length} dokumento • {folders.length} folder • Natitirang storage:{' '}
                    <strong className="text-white">{storage.remainingMB.toFixed(2)} MB</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Maghanap ng file..."
                    className="w-full rounded-xl border border-white/25 bg-white/95 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-white focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/95 px-2.5 py-1.5 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 text-blue-600" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    aria-label="Ayusin ang mga file"
                    className="bg-transparent font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="updated">Kamakailang Binago</option>
                    <option value="opened">Kamakailang Binuksan</option>
                    <option value="created">Bagong Gawa</option>
                    <option value="title">Pangalan (A-Z)</option>
                    <option value="size">Laki ng File</option>
                  </select>
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateDocument(
                        navSection === 'folder' ? selectedFolderId : null,
                        false
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-blue-800 shadow-sm hover:bg-blue-50 transition"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Bagong Dokumento
                  </button>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {loadingList ? (
                <div className="rounded-2xl border border-blue-100 bg-white p-10 text-center text-sm text-slate-500">
                  Kinukuha ang iyong workspace...
                </div>
              ) : (
                <>
                  {/* HOME DASHBOARD OVERVIEW */}
                  {navSection === 'home' && !searchQuery.trim() && (
                    <>
                      {/* Quick Access Action Cards */}
                      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleCreateDocument(null, false)}
                              className="group rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-left text-white shadow-md shadow-blue-600/20 hover:from-blue-800 hover:to-blue-700 transition"
                            >
                              <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                                <FilePlus2 className="h-5 w-5" />
                              </div>
                              <p className="text-sm font-extrabold">Bagong Blangkong Dokumento</p>
                              <p className="text-xs text-blue-100 mt-1">
                                Magsulat at mag-format ng teksto tulad ng Microsoft Word.
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleCreateDocument(null, true)}
                              className="group rounded-2xl border border-blue-200 bg-white p-5 text-left hover:border-blue-400 hover:shadow-md transition"
                            >
                              <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                                <Brush className="h-5 w-5" />
                              </div>
                              <p className="text-sm font-extrabold text-slate-900">
                                Bagong Guhit / Doodle
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Gumuhit nang malaya gamit ang panulat, lapis, at mga hugis.
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolder(null);
                                setFolderModalOpen(true);
                              }}
                              className="group rounded-2xl border border-blue-200 bg-white p-5 text-left hover:border-blue-400 hover:shadow-md transition"
                            >
                              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                                <FolderPlus className="h-5 w-5" />
                              </div>
                              <p className="text-sm font-extrabold text-slate-900">
                                Gumawa ng Bagong Folder
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Ayusin ang iyong mga file gamit ang kulay at icon ng folder.
                              </p>
                            </button>
                          </>
                        )}
                      </section>

                      {/* Recently Opened & Recently Created */}
                      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
                          <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3 flex items-center justify-between">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-blue-600" />
                              Kamakailang Binuksan
                            </span>
                            <button
                              type="button"
                              onClick={() => setNavSection('recent')}
                              className="text-xs font-bold text-blue-700 hover:underline"
                            >
                              Lahat
                            </button>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {recentlyOpenedDocs.length === 0 ? (
                              <p className="p-6 text-xs text-slate-400">Wala pang binuksang file.</p>
                            ) : (
                              recentlyOpenedDocs.map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => void openDocumentById(d.id)}
                                  className="w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-blue-50/40 transition"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-900 truncate">
                                        {d.title}
                                      </p>
                                      <p className="text-[11px] text-slate-400">
                                        {d.folderName || 'Pangunahing Lalagyan'} •{' '}
                                        {formatBytes(d.sizeBytes)}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-slate-400 shrink-0">
                                    {formatDateTimeTL(d.lastOpenedAt || d.updatedAt)}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
                          <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3 flex items-center justify-between">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                              <FilePlus2 className="h-4 w-4 text-blue-600" />
                              Kamakailang Ginawa
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSortBy('created');
                                setNavSection('documents');
                              }}
                              className="text-xs font-bold text-blue-700 hover:underline"
                            >
                              Lahat
                            </button>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {recentlyCreatedDocs.length === 0 ? (
                              <p className="p-6 text-xs text-slate-400">Wala pang ginawang file.</p>
                            ) : (
                              recentlyCreatedDocs.map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => void openDocumentById(d.id)}
                                  className="w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-blue-50/40 transition"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-900 truncate">
                                        {d.title}
                                      </p>
                                      <p className="text-[11px] text-slate-400">
                                        {d.wordCount} salita • {formatBytes(d.sizeBytes)}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-slate-400 shrink-0">
                                    {formatDateTimeTL(d.createdAt)}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </section>
                    </>
                  )}

                  {/* FOLDERS GRID */}
                  {(navSection === 'folders' || navSection === 'folder') && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                          Mga Folder ({visibleFolders.length})
                        </h2>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFolder(null);
                              setFolderModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                            Bagong Folder
                          </button>
                        )}
                      </div>
                      {visibleFolders.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-8 text-center text-xs text-slate-500">
                          Walang subfolder dito.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
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
                                  .zip
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
                      )}
                    </section>
                  )}

                  {/* SHARED BY ME LIST */}
                  {navSection === 'shared' && sharedByMe.length > 0 && (
                    <section className="space-y-2.5">
                      <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                        Mga Dokumentong Ibinahagi Mo ({sharedByMe.length})
                      </h2>
                      <div className="divide-y divide-slate-100 rounded-2xl border border-blue-100 bg-white overflow-hidden">
                        {sharedByMe.map((s) => (
                          <div
                            key={s.shareId}
                            className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{s.title}</p>
                              <p className="text-slate-500">
                                Ibinahagi kay: <strong>{s.recipientName}</strong> ({s.recipientEmail}
                                ) •{' '}
                                {s.permissionLevel === 'read_write'
                                  ? 'Maaaring Mag-edit'
                                  : 'Basahin Lamang'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openDocumentById(s.documentId)}
                              className="rounded-lg bg-blue-50 px-3 py-1 font-bold text-blue-700 hover:bg-blue-100"
                            >
                              Buksan
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* DOCUMENTS LISTING (Shown on Home, Documents, Folder, Recent, Favorites, Shared) */}
                  {navSection !== 'folders' && (
                    <section className="space-y-3">
                      <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                        {navSection === 'shared'
                          ? `Mga Dokumentong Ibinahagi sa Iyo (${visibleDocuments.length})`
                          : `Lahat ng Dokumento (${visibleDocuments.length})`}
                      </h2>
                      {visibleDocuments.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-10 text-center">
                          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <FileText className="h-6 w-6" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {navSection === 'favorites'
                              ? 'Wala pang paboritong dokumento'
                              : navSection === 'shared'
                                ? 'Wala pang dokumentong ibinahagi sa iyo'
                                : 'Wala pang dokumento rito'}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {navSection === 'favorites'
                              ? 'Pindutin ang bituin sa alinmang dokumento upang mailagay dito.'
                              : navSection === 'shared'
                                ? 'Lalabas dito ang mga dokumentong ibinahagi sa iyo ng mga kaklase.'
                                : 'Gumawa ng bagong dokumento o guhit upang makapagsimula.'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                          {visibleDocuments.map(renderDocCard)}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

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

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-blue-100 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900">Palitan ang Pangalan ng Dokumento</h3>
            <input
              type="text"
              autoFocus
              required
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Kanselahin
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                I-save
              </button>
            </div>
          </form>
        </div>
      )}

      {shareDocTarget && (
        <ShareModal
          isOpen={Boolean(shareDocTarget)}
          documentId={shareDocTarget.id}
          documentTitle={shareDocTarget.title}
          onClose={() => setShareDocTarget(null)}
          onNotify={onNotify}
          onChanged={() => void refreshWorkspace()}
        />
      )}

      {pendingDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-rose-200 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <span className="inline-block rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-700 mb-1">
                  Babala sa Pagbura
                </span>
                <h3 className="text-base font-extrabold text-slate-900">
                  {pendingDeleteTarget.type === 'folder'
                    ? 'Burahin ang Folder na Ito?'
                    : pendingDeleteTarget.isDraft
                      ? 'Burahin at Isara ang Bagong Draft?'
                      : 'Burahin ang File na Ito?'}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {pendingDeleteTarget.type === 'folder' ? (
                    <>
                      Sigurado ka bang nais mong burahin ang folder na{' '}
                      <strong className="text-slate-900">&ldquo;{pendingDeleteTarget.label}&rdquo;</strong>{' '}
                      kasama ang lahat ng file sa loob nito? Ililipat ang mga ito sa{' '}
                      <strong>Basurahan</strong>.
                    </>
                  ) : pendingDeleteTarget.isDraft ? (
                    <>
                      Sigurado ka bang nais mong burahin ang hindi pa nai-save na draft na{' '}
                      <strong className="text-slate-900">&ldquo;{pendingDeleteTarget.label}&rdquo;</strong>?
                      Mawawala ang lahat ng ginawa mo rito.
                    </>
                  ) : (
                    <>
                      Sigurado ka bang nais mong burahin ang dokumentong{' '}
                      <strong className="text-slate-900">&ldquo;{pendingDeleteTarget.label}&rdquo;</strong>?
                      Ililipat ito sa <strong>Basurahan (Recycle Bin)</strong> at mawawala sa mga
                      aktibong file mo.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deletingItem}
                onClick={() => setPendingDeleteTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kanselahin
              </button>
              <button
                type="button"
                disabled={deletingItem}
                onClick={() => void executeConfirmedDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingItem
                  ? 'Binubura...'
                  : pendingDeleteTarget.type === 'document' && pendingDeleteTarget.isDraft
                    ? 'Oo, Burahin ang Draft'
                    : 'Oo, Burahin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLeaveAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-blue-100 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Mayroon pang gawa na hindi nai-save
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Paalala: Hindi awtomatikong sine-save ang iyong dokumento o guhit. Kung babalik ka
                  sa workspace nang hindi nagse-save, hindi masa-save ang iyong mga ginawa.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingBeforeLeave}
                onClick={() => setPendingLeaveAction(null)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Magpatuloy sa Pag-edit
              </button>
              <button
                type="button"
                disabled={savingBeforeLeave}
                onClick={() => {
                  const proceed = pendingLeaveAction;
                  setPendingLeaveAction(null);
                  setEditorHasUnsaved(false);
                  proceed();
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                Umalis Nang Hindi Sine-save
              </button>
              <button
                type="button"
                disabled={savingBeforeLeave}
                onClick={async () => {
                  const proceed = pendingLeaveAction;
                  setSavingBeforeLeave(true);
                  const savedOk = editorSaveFnRef.current
                    ? await editorSaveFnRef.current()
                    : true;
                  setSavingBeforeLeave(false);
                  if (savedOk) {
                    setPendingLeaveAction(null);
                    setEditorHasUnsaved(false);
                    proceed();
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {savingBeforeLeave ? 'Sine-save...' : 'I-save at Bumalik'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
