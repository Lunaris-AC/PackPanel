import React, { useEffect, useState, useRef } from 'react';
import {
  Folder,
  FileText,
  Image,
  Search,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  Save,
  RotateCcw,
  Upload,
  Plus,
  History,
  FilePlus,
  FolderPlus,
  X,
  Clock,
  ArrowRight,
  FileCode,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { ExplorerItem, Release, FileHistoryItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

interface ExplorerPageProps {
  endpointId: string;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const ExplorerPage: React.FC<ExplorerPageProps> = ({ endpointId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [currentPrefix, setCurrentPrefix] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const dragCounter = useRef(0);

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // File Viewer / Editor Modal
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  // Create New File Modal
  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');

  // History & Undo Drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<FileHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadDirectory = async (prefix = currentPrefix, searchQuery = search) => {
    setLoading(true);
    try {
      const res = await api.get<{
        hasRelease: boolean;
        release?: Release;
        currentPrefix: string;
        items: ExplorerItem[];
      }>(`/endpoints/${endpointId}/explorer`, {
        prefix,
        search: searchQuery
      });

      setItems(res.items || []);
      setRelease(res.release || null);
    } catch (e: any) {
      toast.error('Erreur chargement explorateur');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get<{ history: FileHistoryItem[] }>(`/endpoints/${endpointId}/explorer/history`);
      setHistoryItems(res.history || []);
    } catch (e: any) {
      toast.error('Impossible de charger l’historique des modifications');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory(currentPrefix, search);
  }, [currentPrefix, endpointId]);

  // Read File Entry recursively for dropped folders
  const readEntryRecursive = async (entry: any, basePath = ''): Promise<Array<{ path: string; file: File }>> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          resolve([{ path: basePath + file.name, file }]);
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries: any[] = await new Promise((resolve) => {
        dirReader.readEntries((results: any[]) => resolve(results));
      });
      const subFiles: Array<{ path: string; file: File }> = [];
      for (const sub of entries) {
        const res = await readEntryRecursive(sub, `${basePath}${entry.name}/`);
        subFiles.push(...res);
      }
      return subFiles;
    }
    return [];
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processAndUploadFiles = async (fileList: Array<{ path: string; file: File }>) => {
    if (!fileList.length) return;
    setIsUploading(true);
    setUploadStatusText(`Préparation de ${fileList.length} fichier(s)...`);

    try {
      // Process in batches of 30 to avoid payload limits
      const BATCH_SIZE = 30;
      for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
        const chunk = fileList.slice(i, i + BATCH_SIZE);
        setUploadStatusText(`Téléversement des fichiers (${Math.min(i + BATCH_SIZE, fileList.length)}/${fileList.length})...`);

        const payloadFiles: Array<{ path: string; contentBase64: string }> = [];
        for (const item of chunk) {
          const b64 = await fileToBase64(item.file);
          payloadFiles.push({
            path: item.path,
            contentBase64: b64
          });
        }

        await api.post(`/endpoints/${endpointId}/explorer/upload-batch`, {
          files: payloadFiles
        });
      }

      toast.success(`${fileList.length} fichier(s) téléversé(s) et nouvelle version publiée !`);
      await loadDirectory(currentPrefix, search);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du téléversement');
    } finally {
      setIsUploading(false);
      setUploadStatusText('');
    }
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (canEdit) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounter.current = 0;
    if (!canEdit) return;

    const items = e.dataTransfer.items;
    const collectedFiles: Array<{ path: string; file: File }> = [];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            const files = await readEntryRecursive(entry, currentPrefix);
            collectedFiles.push(...files);
          }
        } else {
          const f = item.getAsFile();
          if (f) collectedFiles.push({ path: currentPrefix + f.name, file: f });
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        collectedFiles.push({ path: currentPrefix + f.name, file: f });
      }
    }

    if (collectedFiles.length > 0) {
      await processAndUploadFiles(collectedFiles);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files: Array<{ path: string; file: File }> = [];
    for (let i = 0; i < e.target.files.length; i++) {
      const f = e.target.files[i];
      // webkitRelativePath is available if directory selection was used
      const relPath = (f as any).webkitRelativePath || f.name;
      files.push({
        path: currentPrefix + relPath,
        file: f
      });
    }
    await processAndUploadFiles(files);
    e.target.value = '';
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDirectory(currentPrefix, search);
  };

  const handleOpenFolder = (dirPath: string) => {
    setSearch('');
    setCurrentPrefix(dirPath);
  };

  const handleOpenFile = async (item: ExplorerItem) => {
    setActiveFilePath(item.path);
    setViewerOpen(true);
    setIsEditing(false);
    setContentLoading(true);
    setIsImage(false);
    setImageBase64(null);

    try {
      const res = await api.get<{
        path: string;
        isText: boolean;
        isImage?: boolean;
        content?: string;
        base64?: string;
        size: number;
        sha1: string;
      }>(`/endpoints/${endpointId}/explorer/content`, {
        path: item.path
      });

      if (res.isText) {
        setFileContent(res.content || '');
        setOriginalContent(res.content || '');
      } else if (res.isImage && res.base64) {
        setIsImage(true);
        setImageBase64(res.base64);
      } else {
        setFileContent('');
      }
    } catch (err: any) {
      toast.error('Impossible de charger le fichier');
      setViewerOpen(false);
    } finally {
      setContentLoading(false);
    }
  };

  const handleSaveFile = async () => {
    setSavingFile(true);
    try {
      await api.post(`/endpoints/${endpointId}/explorer/save-file`, {
        path: activeFilePath,
        content: fileContent,
        commitNow: true
      });
      toast.success('Fichier modifié et nouvelle version publiée !');
      setViewerOpen(false);
      loadDirectory(currentPrefix, search);
    } catch (e: any) {
      toast.error(e.message || 'Erreur sauvegarde fichier');
    } finally {
      setSavingFile(false);
    }
  };

  const handleCreateNewFile = () => {
    if (!newFilePath.trim()) return;
    const finalPath = currentPrefix + newFilePath.trim().replace(/^\/+/, '');
    setActiveFilePath(finalPath);
    setFileContent('');
    setOriginalContent('');
    setIsEditing(true);
    setIsImage(false);
    setImageBase64(null);
    setCreateFileOpen(false);
    setViewerOpen(true);
    setNewFilePath('');
  };

  const handleDeleteItem = async (item: ExplorerItem) => {
    const isDir = item.isDir;
    const msg = isDir
      ? `Supprimer définitivement le dossier "${item.name}/" et tous ses fichiers ? Une nouvelle version sera créée.`
      : `Supprimer définitivement le fichier "${item.name}" ? Une nouvelle version sera créée.`;

    if (!window.confirm(msg)) return;

    try {
      await api.post(`/endpoints/${endpointId}/explorer/delete`, {
        path: item.path
      });
      toast.success('Élément supprimé et version mise à jour');
      loadDirectory(currentPrefix, search);
    } catch (e: any) {
      toast.error(e.message || 'Erreur suppression');
    }
  };

  const handleUndo = async (historyId: string) => {
    setUndoingId(historyId);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/endpoints/${endpointId}/explorer/undo/${historyId}`
      );
      toast.success(res.message || 'Modification annulée !');
      await loadHistory();
      await loadDirectory(currentPrefix, search);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l’annulation');
    } finally {
      setUndoingId(null);
    }
  };

  const breadcrumbSegments = currentPrefix.split('/').filter(Boolean);

  return (
    <div
      className="space-y-4 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileInputChange}
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="hidden"
      />

      {/* Drag & Drop Overlay */}
      {isDraggingOver && canEdit && (
        <div className="absolute inset-0 z-40 bg-zinc-950/80 backdrop-blur-xs border-2 border-dashed border-sky-500 rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-none">
          <Upload className="w-12 h-12 text-sky-400 animate-bounce mb-3" />
          <h3 className="text-lg font-bold text-white tracking-tight">
            Déposez vos fichiers ou dossiers ici
          </h3>
          <p className="text-xs text-zinc-300 mt-1 max-w-md">
            Ils seront automatiquement ingérés dans le Content-Addressed Storage et publiés dans une nouvelle version atomique.
          </p>
        </div>
      )}

      {/* Uploading Banner */}
      {isUploading && (
        <div className="bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl p-3 flex items-center justify-between text-xs text-sky-800 dark:text-sky-200 animate-pulse">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-sky-500 border-t-transparent" />
            <span className="font-semibold">{uploadStatusText}</span>
          </div>
          <span className="text-[11px] font-mono opacity-80">Publication automatique...</span>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
        {/* Breadcrumbs Navigation */}
        <div className="flex items-center space-x-1.5 text-xs overflow-x-auto py-1">
          <button
            onClick={() => {
              setSearch('');
              setCurrentPrefix('');
            }}
            className="font-semibold text-zinc-700 dark:text-zinc-300 hover:text-sky-500 dark:hover:text-sky-400 shrink-0"
          >
            racine
          </button>
          {breadcrumbSegments.map((seg, idx) => {
            const pathUpTo = breadcrumbSegments.slice(0, idx + 1).join('/') + '/';
            const isLast = idx === breadcrumbSegments.length - 1;
            return (
              <React.Fragment key={pathUpTo}>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <button
                  onClick={() => {
                    setSearch('');
                    setCurrentPrefix(pathUpTo);
                  }}
                  className={`shrink-0 ${
                    isLast
                      ? 'font-bold text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Buttons & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-48 sm:w-56 shrink-0">
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2 pointer-events-none" />
          </form>

          {canEdit && (
            <>
              {/* Add Files */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg flex items-center space-x-1.5 transition"
                title="Ajouter des fichiers"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Fichiers</span>
              </button>

              {/* Add Folder */}
              <button
                onClick={() => folderInputRef.current?.click()}
                className="px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg flex items-center space-x-1.5 transition"
                title="Ajouter un dossier complet"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Dossier</span>
              </button>

              {/* New Text File */}
              <button
                onClick={() => setCreateFileOpen(true)}
                className="px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg flex items-center space-x-1.5 transition"
                title="Créer un fichier texte"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Créer</span>
              </button>
            </>
          )}

          {/* History Drawer Trigger */}
          <button
            onClick={() => {
              setHistoryOpen(true);
              loadHistory();
            }}
            className="px-2.5 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg flex items-center space-x-1.5 transition"
            title="Historique des modifications et annulations"
          >
            <History className="w-3.5 h-3.5 text-sky-500" />
            <span>Historique & Undo</span>
          </button>
        </div>
      </div>

      {/* Explorer Content Table / Dropzone */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-500 border-t-transparent"></div>
          </div>
        ) : !release ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Aucun fichier dans cet endpoint
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Glissez-déposez vos mods, configurations ou dossiers complets ici pour publier la première version.
            </p>
            {canEdit && (
              <div className="mt-4 flex items-center justify-center space-x-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-lg shadow-2xs flex items-center space-x-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Sélectionner des fichiers</span>
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium text-xs rounded-lg transition flex items-center space-x-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Sélectionner un dossier</span>
                </button>
              </div>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 px-4 text-xs text-zinc-400">
            Dossier vide ou aucun fichier correspondant à la recherche.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800/80 text-zinc-400 font-semibold uppercase text-[10px] tracking-wider bg-zinc-50/50 dark:bg-zinc-800/30">
                <th className="py-2.5 px-4">Nom</th>
                <th className="py-2.5 px-4 hidden md:table-cell">Empreinte SHA-1</th>
                <th className="py-2.5 px-4">Taille</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-sans">
              {items.map(item => (
                <tr
                  key={item.path}
                  onClick={() => (item.isDir ? handleOpenFolder(item.path) : handleOpenFile(item))}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer transition"
                >
                  <td className="py-2.5 px-4 font-medium flex items-center space-x-2.5 text-zinc-800 dark:text-zinc-200">
                    {item.isDir ? (
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : item.name.endsWith('.png') ? (
                      <Image className="w-4 h-4 text-purple-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </td>

                  <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400 hidden md:table-cell">
                    {item.sha1 ? item.sha1 : <span className="italic text-zinc-500">dossier</span>}
                  </td>

                  <td className="py-2.5 px-4 text-zinc-500">
                    {item.isDir ? '-' : formatBytes(item.size)}
                  </td>

                  <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1">
                      {!item.isDir && (
                        <button
                          onClick={() => handleOpenFile(item)}
                          title="Aperçu / Édition"
                          className="p-1 text-zinc-400 hover:text-sky-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteItem(item)}
                          title="Supprimer"
                          className="p-1 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* History & Undo Modal */}
      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Historique des modifications & Annulations (Undo)"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Chaque modification, ajout ou suppression est tracé. Cliquez sur « Annuler » pour restaurer immédiatement l'état précédent d'un fichier.
          </p>

          {historyLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-500 border-t-transparent" />
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-400">
              Aucune modification enregistrée pour cet endpoint.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {historyItems.map(item => {
                const isUndo = item.action === 'undo';
                const isCreate = item.action === 'create';
                const isEdit = item.action === 'edit';
                const isDelete = item.action === 'delete';

                return (
                  <div key={item.id} className="pt-2.5 pb-2 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        {isCreate && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            + Ajouté
                          </span>
                        )}
                        {isEdit && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                            ~ Modifié
                          </span>
                        )}
                        {isDelete && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                            - Supprimé
                          </span>
                        )}
                        {isUndo && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            ↺ Annulé
                          </span>
                        )}
                        <span className="font-mono text-zinc-900 dark:text-zinc-100 font-medium">
                          {item.relative_path}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                        <span>Par {item.user_name || 'utilisateur'}</span>
                        <span>•</span>
                        <span>{new Date(item.created_at).toLocaleString('fr-FR')}</span>
                        {item.new_size ? (
                          <>
                            <span>•</span>
                            <span>{formatBytes(item.new_size)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {!isUndo && canEdit && (
                      <button
                        onClick={() => handleUndo(item.id)}
                        disabled={undoingId === item.id}
                        className="px-2.5 py-1 text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg flex items-center space-x-1 transition disabled:opacity-50"
                        title="Annuler cette modification et restaurer le fichier"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${undoingId === item.id ? 'animate-spin' : ''}`} />
                        <span>{undoingId === item.id ? 'Annulation...' : 'Annuler'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Create New File Modal */}
      <Modal
        isOpen={createFileOpen}
        onClose={() => setCreateFileOpen(false)}
        title="Créer un nouveau fichier texte"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Chemin relatif du fichier
            </label>
            <div className="flex items-center bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono">
              <span className="text-zinc-400 mr-1">{currentPrefix}</span>
              <input
                type="text"
                autoFocus
                placeholder="config/options.txt"
                value={newFilePath}
                onChange={e => setNewFilePath(e.target.value)}
                className="w-full bg-transparent focus:outline-none text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Exemples : <code className="text-zinc-600 dark:text-zinc-300">options.txt</code>, <code className="text-zinc-600 dark:text-zinc-300">config/forge.cfg</code>, <code className="text-zinc-600 dark:text-zinc-300">kubejs/server_scripts/main.js</code>
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateFileOpen(false)}
              className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCreateNewFile}
              disabled={!newFilePath.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition disabled:opacity-50"
            >
              Continuer vers l'éditeur
            </button>
          </div>
        </div>
      </Modal>

      {/* File Viewer / Editor Modal */}
      <Modal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={activeFilePath}
        maxWidth="max-w-4xl"
      >
        {contentLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-500 border-t-transparent"></div>
          </div>
        ) : isImage && imageBase64 ? (
          <div className="flex flex-col items-center justify-center p-4">
            <img
              src={imageBase64}
              alt={activeFilePath}
              className="max-h-96 rounded-lg object-contain shadow"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {canEdit && (
              <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-400">
                  {isEditing ? 'Mode édition actif' : 'Mode lecture seule'}
                </span>
                <div className="flex items-center space-x-2">
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 font-medium flex items-center space-x-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Modifier</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setFileContent(originalContent);
                        setIsEditing(false);
                      }}
                      className="px-3 py-1 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-500 flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Réinitialiser</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <textarea
              readOnly={!isEditing}
              value={fileContent}
              onChange={e => setFileContent(e.target.value)}
              rows={18}
              className={`w-full p-4 font-mono text-xs rounded-xl border focus:outline-none transition leading-relaxed ${
                isEditing
                  ? 'bg-white dark:bg-zinc-950 border-sky-500/70 ring-2 ring-sky-500/20 text-zinc-900 dark:text-zinc-100'
                  : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
              }`}
            />

            {isEditing && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  L'enregistrement publiera immédiatement une nouvelle version atomique et l'enregistrera dans l'historique des modifications.
                </p>
                <button
                  onClick={handleSaveFile}
                  disabled={savingFile}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-xl shadow-2xs flex items-center space-x-1.5 disabled:opacity-60 transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingFile ? 'Enregistrement...' : 'Enregistrer & Publier'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
