import React, { useEffect, useState } from 'react';
import {
  Server,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Settings,
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

interface EndpointsPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const EndpointsPage: React.FC<EndpointsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { toast } = useToast();
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
  const [autoPublish, setAutoPublish] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const loadEndpoints = async () => {
    try {
      const res = await api.get<{ endpoints: Endpoint[] }>('/endpoints');
      setEndpoints(res.endpoints);
    } catch (err: any) {
      toast.error('Impossible de charger les endpoints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEndpoints();
  }, []);

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('URL MineLaunched copiée dans le presse-papiers');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlug.trim() || !newName.trim()) return;

    const cleanupRules: string[] = [];
    if (cleanupMods) cleanupRules.push('mods');
    if (cleanupConfig) cleanupRules.push('config');

    setFormSubmitting(true);
    try {
      await api.post('/endpoints', {
        slug: newSlug.trim().toLowerCase(),
        name: newName.trim(),
        description: newDesc.trim(),
        cleanup_rules: cleanupRules,
        auto_publish: autoPublish
      });
      toast.success('Endpoint créé avec succès');
      setCreateModalOpen(false);
      setNewSlug('');
      setNewName('');
      setNewDesc('');
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création');
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
      toast.success(`Version de ${selectedSourceEp.name} déployée vers l'endpoint cible`);
      setPromoteModalOpen(false);
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la promotion');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (ep: Endpoint) => {
    if (!window.confirm(`Confirmez-vous la suppression définitive de l'endpoint "${ep.name}" ?`)) {
      return;
    }
    try {
      await api.delete(`/endpoints/${ep.id}`);
      toast.success('Endpoint supprimé');
      loadEndpoints();
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Endpoints de distribution
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez vos environnements de jeu, serveurs et profils MineLaunched indépendants
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl shadow-md shadow-brand-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvel endpoint
          </button>
        )}
      </div>

      {/* Grid of Endpoints */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {endpoints.map(ep => (
          <div
            key={ep.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-brand-500/50 transition duration-150"
          >
            <div>
              {/* Top meta */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {ep.name}
                  </h3>
                  <div className="font-mono text-xs text-brand-600 dark:text-brand-400 mt-0.5">
                    /{ep.slug}
                  </div>
                </div>
                {ep.active_release_id ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                    {ep.active_release_id}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                    Brouillon
                  </span>
                )}
              </div>

              {ep.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                  {ep.description}
                </p>
              )}

              {/* MineLaunched URL Box */}
              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl">
                <span className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  URL Contrat MineLaunched
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate mr-2" title={ep.manifest_url}>
                    {ep.manifest_url}
                  </span>
                  <button
                    onClick={() => handleCopy(ep.manifest_url, ep.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition shrink-0"
                    title="Copier l'URL"
                  >
                    {copiedId === ep.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
                <div>
                  <span className="text-slate-400">Fichiers : </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {ep.active_total_files || 0}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Taille : </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatBytes(Number(ep.active_total_bytes) || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => onNavigate(`endpoint:${ep.id}`)}
                className="inline-flex items-center text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-500 transition"
              >
                <FolderOpen className="w-4 h-4 mr-1.5" />
                Explorateur & Fichiers
              </button>

              <div className="flex items-center space-x-1">
                {canEdit && (
                  <button
                    onClick={() => {
                      setSelectedSourceEp(ep);
                      setPromoteModalOpen(true);
                    }}
                    title="Promouvoir / Cloner vers un autre endpoint"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                {user?.role === 'admin' && (
                  <button
                    onClick={() => handleDelete(ep)}
                    title="Supprimer l'endpoint"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
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
        title="Créer un nouvel endpoint"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Nom d'affichage
            </label>
            <input
              type="text"
              required
              placeholder="ex: FTB Evolution - Production"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Slug (Identifiant d'URL stable)
            </label>
            <input
              type="text"
              required
              pattern="^[a-z0-9_-]+$"
              placeholder="ex: ftbevol-prod"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value)}
              className="w-full px-3 py-2 font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Uniquement minuscules, chiffres et tirets. Détermine l'URL publique <code className="text-brand-500">/{newSlug || '...'}/index.php</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Description (facultatif)
            </label>
            <textarea
              rows={2}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <span className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Directives de nettoyage MineLaunched (dirCheckUselessFiles)
            </span>

            <label className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanupMods}
                onChange={e => setCleanupMods(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Nettoyer le dossier <strong>mods</strong> (Recommandé)</span>
            </label>

            <label className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanupConfig}
                onChange={e => setCleanupConfig(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Nettoyer le dossier <strong>config</strong></span>
            </label>

            {cleanupConfig && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <span>
                  <strong>Attention :</strong> Activer le nettoyage automatique du dossier <code>config</code> supprimera les modifications locales effectuées par les joueurs.
                </span>
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-lg shadow disabled:opacity-60"
            >
              {formSubmitting ? 'Création...' : 'Créer l’endpoint'}
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
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Cette action copiera la version active de <strong>{selectedSourceEp?.name}</strong> vers un autre endpoint (par exemple de Préproduction vers Production) et la publiera immédiatement de manière atomique.
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Endpoint de destination
            </label>
            <select
              required
              value={targetEndpointId}
              onChange={e => setTargetEndpointId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

          <div className="pt-4 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setPromoteModalOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formSubmitting || !targetEndpointId}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm rounded-lg shadow disabled:opacity-60"
            >
              {formSubmitting ? 'Promotion...' : 'Déployer la version'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
