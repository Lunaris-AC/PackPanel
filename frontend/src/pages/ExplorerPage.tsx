import React, { useEffect, useState } from 'react';
import {
  Folder,
  File,
  FileText,
  Image,
  Search,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  Save,
  Download,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { api } from '../api/client';
import { ExplorerItem, Release } from '../types';
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

  useEffect(() => {
    loadDirectory(currentPrefix, search);
  }, [currentPrefix, endpointId]);

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

  // Build breadcrumbs
  const breadcrumbSegments = currentPrefix.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Top Bar: Release Status & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Breadcrumbs */}
        <div className="flex items-center space-x-1.5 text-xs sm:text-sm overflow-x-auto py-1">
          <button
            onClick={() => {
              setSearch('');
              setCurrentPrefix('');
            }}
            className="font-semibold text-brand-600 dark:text-brand-400 hover:underline shrink-0"
          >
            racine
          </button>
          {breadcrumbSegments.map((seg, idx) => {
            const pathUpTo = breadcrumbSegments.slice(0, idx + 1).join('/') + '/';
            const isLast = idx === breadcrumbSegments.length - 1;
            return (
              <React.Fragment key={pathUpTo}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  onClick={() => {
                    setSearch('');
                    setCurrentPrefix(pathUpTo);
                  }}
                  className={`shrink-0 ${
                    isLast
                      ? 'font-bold text-slate-800 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline'
                  }`}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Global Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative sm:w-64 shrink-0">
          <input
            type="text"
            placeholder="Rechercher un fichier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
        </form>
      </div>

      {/* Explorer Content Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-500"></div>
          </div>
        ) : !release ? (
          <div className="text-center py-16 px-4">
            <Folder className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
              Aucune version publiée
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Cet endpoint n'a pas encore de version active. Allez dans l'onglet Téléversement pour publier des fichiers ou un ZIP.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 px-4 text-xs text-slate-400">
            Dossier vide ou aucun fichier correspondant à la recherche.
          </div>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[11px] tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-2.5 px-4">Nom</th>
                <th className="py-2.5 px-4 hidden md:table-cell">Empreinte SHA-1</th>
                <th className="py-2.5 px-4">Taille</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(item => (
                <tr
                  key={item.path}
                  onClick={() => (item.isDir ? handleOpenFolder(item.path) : handleOpenFile(item))}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <td className="py-2.5 px-4 font-medium flex items-center space-x-2 text-slate-800 dark:text-slate-200">
                    {item.isDir ? (
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : item.name.endsWith('.png') ? (
                      <Image className="w-4 h-4 text-purple-500 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </td>

                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 hidden md:table-cell">
                    {item.sha1 ? item.sha1 : <span className="italic text-slate-300 dark:text-slate-600">dossier</span>}
                  </td>

                  <td className="py-2.5 px-4 text-slate-500">
                    {item.isDir ? '-' : formatBytes(item.size)}
                  </td>

                  <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1">
                      {!item.isDir && (
                        <button
                          onClick={() => handleOpenFile(item)}
                          title="Aperçu / Édition"
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteItem(item)}
                          title="Supprimer"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* File Viewer / Editor Modal */}
      <Modal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={activeFilePath}
        maxWidth="max-w-4xl"
      >
        {contentLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
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
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">
                  {isEditing ? 'Mode édition actif' : 'Mode lecture seule'}
                </span>
                <div className="flex items-center space-x-2">
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium flex items-center space-x-1"
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
                      className="px-3 py-1 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-500 flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Annuler les modifications</span>
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
              className={`w-full p-4 font-mono text-xs rounded-xl border focus:outline-none transition ${
                isEditing
                  ? 'bg-white dark:bg-slate-950 border-brand-500/70 ring-2 ring-brand-500/20 text-slate-900 dark:text-slate-100'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
              }`}
            />

            {isEditing && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  L'enregistrement publiera immédiatement une nouvelle version atomique pour ce modpack.
                </p>
                <button
                  onClick={handleSaveFile}
                  disabled={savingFile}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow flex items-center space-x-1.5 disabled:opacity-60"
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
