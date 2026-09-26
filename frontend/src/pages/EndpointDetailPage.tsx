import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  FolderOpen,
  History,
  Settings,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import { Endpoint } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { ExplorerPage } from './ExplorerPage';
import { VersionsPage } from './VersionsPage';

interface EndpointDetailPageProps {
  endpointId: string;
  onBack: () => void;
}

export const EndpointDetailPage: React.FC<EndpointDetailPageProps> = ({ endpointId, onBack }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'explorer' | 'versions' | 'settings'>('explorer');
  const [copied, setCopied] = useState(false);

  // Settings form state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCleanupMods, setEditCleanupMods] = useState(true);
  const [editCleanupConfig, setEditCleanupConfig] = useState(false);
  const [editAutoPublish, setEditAutoPublish] = useState(false);
  const [editRetentionDays, setEditRetentionDays] = useState(14);
  const [editMinVersions, setEditMinVersions] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadEndpoint = async () => {
    try {
      const res = await api.get<{ endpoint: Endpoint }>(`/endpoints/${endpointId}`);
      setEndpoint(res.endpoint);
      setEditName(res.endpoint.name);
      setEditDesc(res.endpoint.description || '');
      setEditCleanupMods(res.endpoint.cleanup_rules?.includes('mods') ?? true);
      setEditCleanupConfig(res.endpoint.cleanup_rules?.includes('config') ?? false);
      setEditAutoPublish(res.endpoint.auto_publish);
      setEditRetentionDays(res.endpoint.default_retention_days);
      setEditMinVersions(res.endpoint.min_retained_versions);
    } catch (e: any) {
      toast.error('Erreur chargement endpoint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEndpoint();
  }, [endpointId]);

  const handleCopyUrl = () => {
    if (!endpoint) return;
    navigator.clipboard.writeText(endpoint.manifest_url);
    setCopied(true);
    toast.success('URL du manifeste copiée !');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    const cleanupRules: string[] = [];
    if (editCleanupMods) cleanupRules.push('mods');
    if (editCleanupConfig) cleanupRules.push('config');

    try {
      await api.put(`/endpoints/${endpointId}`, {
        name: editName,
        description: editDesc,
        cleanup_rules: cleanupRules,
        auto_publish: editAutoPublish,
        default_retention_days: editRetentionDays,
        min_retained_versions: editMinVersions
      });
      toast.success('Paramètres enregistrés');
      loadEndpoint();
    } catch (err: any) {
      toast.error(err.message || 'Erreur enregistrement paramètres');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading || !endpoint) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb Nav */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              onClick={onBack}
              className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Retour à la liste des endpoints
            </button>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {endpoint.name}
              </h1>
              {endpoint.active_release_id ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  {endpoint.active_release_id}
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Non publié
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Slug : <span className="text-brand-600 dark:text-brand-400 font-semibold">{endpoint.slug}</span>
            </p>
          </div>

          {/* Copy URL Pill */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3.5 py-2 rounded-xl text-xs font-mono">
              <span className="text-slate-600 dark:text-slate-300 truncate max-w-xs md:max-w-md">
                {endpoint.manifest_url}
              </span>
              <button
                onClick={handleCopyUrl}
                className="p-1 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition shrink-0"
                title="Copier l'URL du manifeste"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {!endpoint.active_release_id && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-sans">
                ⚠ Active dès la publication de la 1ère version (HTTP 404 actuellement)
              </span>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center space-x-2 border-t border-slate-100 dark:border-slate-800 mt-6 pt-4 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center px-3.5 py-2 rounded-xl transition ${
              activeTab === 'explorer'
                ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Explorateur de fichiers
          </button>

          <button
            onClick={() => setActiveTab('versions')}
            className={`flex items-center px-3.5 py-2 rounded-xl transition ${
              activeTab === 'versions'
                ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4 mr-2" />
            Versions & Rollback
          </button>

          {canEdit && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center px-3.5 py-2 rounded-xl transition ${
                activeTab === 'settings'
                  ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Settings className="w-4 h-4 mr-2" />
              Paramètres
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'explorer' && <ExplorerPage endpointId={endpointId} />}
      {activeTab === 'versions' && <VersionsPage endpointId={endpointId} />}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm max-w-2xl">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
            Configuration de l'endpoint
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Nom du modpack / environnement
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                Directives de synchronisation & nettoyage
              </span>

              <label className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCleanupMods}
                  onChange={e => setEditCleanupMods(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Nettoyer le dossier <strong>mods</strong></span>
              </label>

              <label className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editCleanupConfig}
                  onChange={e => setEditCleanupConfig(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Nettoyer le dossier <strong>config</strong></span>
              </label>

              {editCleanupConfig && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start space-x-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                  <span>
                    <strong>Attention :</strong> Nettoyer le dossier <code>config</code> écrasera les modifications locales des joueurs.
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Rétention (Jours)
                </label>
                <input
                  type="number"
                  min={1}
                  value={editRetentionDays}
                  onChange={e => setEditRetentionDays(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Versions min. conservées
                </label>
                <input
                  type="number"
                  min={1}
                  value={editMinVersions}
                  onChange={e => setEditMinVersions(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow transition disabled:opacity-60"
              >
                {savingSettings ? 'Enregistrement...' : 'Enregistrer les paramètres'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
