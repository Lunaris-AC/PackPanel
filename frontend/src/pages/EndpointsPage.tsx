import React, { useEffect, useState } from 'react';
import {
  Server,
  Plus,
  Copy,
  Check,
  Trash2,
  Share2,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { api } from '../api/client';
import { Endpoint } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useTranslation } from '../i18n';

interface EndpointsPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const EndpointsPage: React.FC<EndpointsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [selectedSourceEp, setSelectedSourceEp] = useState<Endpoint | null>(null);
  const [targetEndpointId, setTargetEndpointId] = useState<string>('');

  // Form state
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [cleanupMods, setCleanupMods] = useState(true);
  const [cleanupConfig, setCleanupConfig] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const loadEndpoints = async () => {
    try {
      const res = await api.get<{ endpoints: Endpoint[] }>('/endpoints');
      setEndpoints(res.endpoints);
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEndpoints();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(t('common.copied'));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlug.trim() || !newName.trim()) return;

    setFormSubmitting(true);
    const cleanupRules: string[] = [];
    if (cleanupMods) cleanupRules.push('mods');
    if (cleanupConfig) cleanupRules.push('config');

    try {
      await api.post('/endpoints', {
        slug: newSlug.trim().toLowerCase(),
        name: newName.trim(),
        description: newDesc.trim(),
        cleanup_rules: cleanupRules
      });
      toast.success(t('common.success'));
      setCreateModalOpen(false);
      setNewSlug('');
      setNewName('');
      setNewDesc('');
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSourceEp || !targetEndpointId) return;

    setFormSubmitting(true);
    try {
      await api.post(`/endpoints/${selectedSourceEp.id}/promote`, {
        targetEndpointId
      });
      toast.success(t('common.success'));
      setPromoteModalOpen(false);
      setSelectedSourceEp(null);
      setTargetEndpointId('');
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (ep: Endpoint) => {
    if (!window.confirm(t('endpoints.delete_confirm'))) {
      return;
    }

    try {
      await api.delete(`/endpoints/${ep.id}`);
      toast.success(t('common.success'));
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight font-sans">
            {t('endpoints.title')}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {t('endpoints.subtitle')}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-xs transition self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('endpoints.new_btn')}
          </button>
        )}
      </div>

      {/* Grid of Endpoints */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {endpoints.map(ep => (
          <div
            key={ep.id}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition"
          >
            <div>
              {/* Top meta */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-sans">
                    {ep.name}
                  </h3>
                  <div className="font-mono text-xs text-zinc-500 mt-0.5">
                    /{ep.slug}
                  </div>
                </div>
                {ep.active_release_id ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                    {ep.active_release_id}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    {t('endpoints.badge_draft')}
                  </span>
                )}
              </div>

              {ep.description && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 line-clamp-2">
                  {ep.description}
                </p>
              )}

              {/* MineLaunched URL Box */}
              <div className="mt-3 p-2.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="block text-[10px] font-semibold uppercase text-zinc-400">
                    {t('endpoints.manifest_url')}
                  </span>
                  {!ep.active_release_id && (
                    <span className="text-[10px] font-mono font-medium text-amber-600 dark:text-amber-400">
                      HTTP 404
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 truncate mr-2" title={ep.manifest_url}>
                    {ep.manifest_url}
                  </span>
                  <button
                    onClick={() => handleCopy(ep.manifest_url, ep.id)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition shrink-0"
                    title={t('common.copy')}
                  >
                    {copiedId === ep.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-zinc-500 font-mono text-[11px]">
                <div>
                  <span className="text-zinc-400">{t('endpoints.files_label')}: </span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {ep.active_total_files || 0}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">{t('endpoints.size_label')}: </span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {formatBytes(Number(ep.active_total_bytes) || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions footer */}
            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
              <button
                onClick={() => onNavigate(`endpoint:${ep.id}`)}
                className="inline-flex items-center text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                <span>Explorateur & Versions</span>
              </button>

              <div className="flex items-center space-x-1">
                {canEdit && (
                  <button
                    onClick={() => {
                      setSelectedSourceEp(ep);
                      setPromoteModalOpen(true);
                    }}
                    title="Promouvoir vers un autre endpoint"
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {user?.role === 'admin' && (
                  <button
                    onClick={() => handleDelete(ep)}
                    title={t('common.delete')}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Create Endpoint */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={t('endpoints.new_btn')}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Nom d'affichage
            </label>
            <input
              type="text"
              required
              placeholder="ex: Create Adventures"
              value={newName}
              onChange={e => {
                setNewName(e.target.value);
                if (!newSlug) {
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-'));
                }
              }}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Slug (Identifiant d'URL)
            </label>
            <input
              type="text"
              required
              pattern="^[a-z0-9_-]+$"
              placeholder="ex: create-adventures"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              className="w-full px-3 py-2 font-mono text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Minuscules, chiffres et tirets. Détermine l'URL publique <code className="font-mono text-zinc-700 dark:text-zinc-300">/{newSlug || '...'}/index.php</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Description (facultatif)
            </label>
            <textarea
              rows={2}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
            <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Directives de synchronisation & nettoyage des dossiers
            </span>

            <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanupMods}
                onChange={e => setCleanupMods(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span>Nettoyer le dossier <strong>mods</strong> (Recommandé)</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanupConfig}
                onChange={e => setCleanupConfig(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span>Nettoyer le dossier <strong>config</strong></span>
            </label>

            {cleanupConfig && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                <span>
                  Attention : Nettoyer <code>config</code> supprimera les modifications locales effectuées par les joueurs.
                </span>
              </div>
            )}
          </div>

          <div className="pt-3 flex justify-end space-x-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-lg hover:bg-zinc-800 dark:hover:bg-white shadow-xs transition disabled:opacity-50"
            >
              {formSubmitting ? t('common.loading') : t('common.create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Promote / Clone */}
      <Modal
        isOpen={promoteModalOpen}
        onClose={() => setPromoteModalOpen(false)}
        title="Promouvoir / Cloner la version active"
      >
        <form onSubmit={handlePromote} className="space-y-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Copiera la version active de <strong>{selectedSourceEp?.name}</strong> vers un autre endpoint (ex. Préproduction vers Production) et la publiera immédiatement de manière atomique.
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Endpoint de destination
            </label>
            <select
              required
              value={targetEndpointId}
              onChange={e => setTargetEndpointId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            >
              <option value="">Sélectionnez un endpoint cible...</option>
              {endpoints
                .filter(e => e.id !== selectedSourceEp?.id)
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name} (/{e.slug})
                  </option>
                ))}
            </select>
          </div>

          <div className="pt-3 flex justify-end space-x-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setPromoteModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={formSubmitting || !targetEndpointId}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs rounded-lg hover:bg-zinc-800 dark:hover:bg-white shadow-xs transition disabled:opacity-50"
            >
              {formSubmitting ? t('common.loading') : 'Déployer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
