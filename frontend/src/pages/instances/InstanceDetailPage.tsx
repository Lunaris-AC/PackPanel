import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  FolderOpen,
  History,
  Monitor,
  Settings,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  Send,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  Server,
  Cpu
} from 'lucide-react';
import { api } from '../../api/client';
import { MinecraftInstance } from '../../types';
import { useToast } from '../../components/Toast';
import { ExplorerPage } from '../ExplorerPage';
import { VersionsPage } from '../VersionsPage';
import { InstanceLauncherTab } from './InstanceLauncherTab';
import { InstanceSettingsTab } from './InstanceSettingsTab';

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const InstanceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [instance, setInstance] = useState<MinecraftInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Extract current sub-tab from path: /instances/:id/:tab
  const pathParts = location.pathname.split('/');
  const subTab = pathParts[3] || 'overview';

  const loadInstance = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await api.get<{ instance: MinecraftInstance }>(`/v2/instances/${id}`);
      setInstance(res.instance);
    } catch (err: any) {
      toast.error('Instance introuvable: ' + (err.message || ''));
      navigate('/instances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstance();
  }, [id]);

  const handleCopyManifest = () => {
    if (!instance?.manifest_url) return;
    navigator.clipboard.writeText(instance.manifest_url);
    setCopiedUrl(true);
    toast.success('URL du manifeste PackPanel copiée !');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handlePublish = async () => {
    if (!instance) return;
    if (!window.confirm(`Publier une nouvelle version pour "${instance.name}" ? Cela figera les fichiers actuels et la configuration de jeu.`)) return;

    try {
      setPublishing(true);
      await api.post(`/v2/instances/${instance.id}/publish`);
      toast.success('Nouvelle version publiée avec succès ! Le manifeste packpanel.json est à jour.');
      loadInstance();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la publication');
    } finally {
      setPublishing(false);
    }
  };

  if (loading || !instance) {
    return (
      <div className="py-24 flex justify-center items-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="text-xs text-zinc-400">Chargement de l'instance...</span>
        </div>
      </div>
    );
  }

  const isPublished = Boolean(instance.active_release_id);
  const hasPendingChanges = (instance.pendingChangesCount || 0) > 0 || instance.hasDraftConfigChanges;

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb & Instance Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <button
              onClick={() => navigate('/instances')}
              className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 mb-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Toutes les instances
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {instance.name}
              </h1>

              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold ${
                instance.loader_type === 'fabric'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                  : instance.loader_type === 'forge'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                  : instance.loader_type === 'neoforge'
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
                  : instance.loader_type === 'quilt'
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}>
                {instance.loader_type} {instance.minecraft_version}
              </span>

              {isPublished ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {instance.active_release_id}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Brouillon non publié
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500 font-mono">
              Slug : <span className="text-indigo-600 dark:text-indigo-400 font-bold">{instance.slug}</span>
              {instance.server_address && (
                <span className="ml-3 text-zinc-400">
                  • Serveur : <strong className="text-zinc-700 dark:text-zinc-300 font-mono">{instance.server_address}</strong>
                </span>
              )}
            </p>
          </div>

          {/* Quick Publish CTA button */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePublish}
              disabled={publishing}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition shadow-xs flex items-center gap-1.5 ${
                hasPendingChanges
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white animate-pulse'
                  : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {publishing ? 'Publication...' : hasPendingChanges ? 'Publier les modifications' : 'Publier une version'}
            </button>
          </div>
        </div>

        {/* Deep-Linked Tabs */}
        <div className="flex items-center space-x-1 border-t border-zinc-100 dark:border-zinc-800/80 mt-6 pt-3 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'overview', label: "Vue d'ensemble", icon: LayoutDashboard },
            { id: 'files', label: 'Fichiers & Mods', icon: FolderOpen },
            { id: 'publications', label: 'Publications & Rollback', icon: History },
            { id: 'launcher', label: 'Launcher personnalisé', icon: Monitor },
            { id: 'settings', label: 'Paramètres', icon: Settings }
          ].map(tab => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(`/instances/${instance.id}/${tab.id}`)}
                className={`flex items-center px-3.5 py-2 rounded-xl transition shrink-0 ${
                  active
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs font-bold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mr-2 ${active ? 'text-white dark:text-zinc-900' : 'text-zinc-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* Draft modifications alert */}
          {hasPendingChanges && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <span className="font-bold block">Des modifications non publiées sont en attente</span>
                  <p className="text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                    {instance.hasDraftConfigChanges && 'Les paramètres de jeu (moteur, Java ou serveur) ont été modifiés. '}
                    {(instance.pendingChangesCount || 0) > 0 && `${instance.pendingChangesCount} fichier(s) téléversé(s) en attente d'incorporation. `}
                    Vos joueurs utilisent actuellement la version figée active.
                  </p>
                </div>
              </div>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition shrink-0 shadow-2xs"
              >
                {publishing ? 'Publication...' : 'Publier maintenant'}
              </button>
            </div>
          )}

          {/* Quick Metrics KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Version active</span>
              <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
                {instance.active_release_id || 'Aucune'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {isPublished ? 'Distribuée aux joueurs' : 'Brouillon initial'}
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Contenu publié</span>
              <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
                {instance.active_total_files || 0} fichiers
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Volume : {formatBytes(instance.active_total_bytes)}
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Moteur de jeu</span>
              <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1 capitalize">
                {instance.loader_type}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                MC {instance.minecraft_version} • Java {instance.java_version}
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Launcher dédié</span>
              <p className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
                {instance.launcher_enabled ? 'Configuré' : 'Désactivé'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {instance.launcher_enabled ? (instance.launcher?.template || 'Community') : 'Optionnel'}
              </p>
            </div>
          </div>

          {/* Distribution Manifest Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" />
                Distribution du manifeste packpanel.json
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Ce manifeste immuable est interrogé automatiquement par le launcher PackPanel pour synchroniser les fichiers et lancer le jeu.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 p-3 rounded-xl text-xs font-mono">
              <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1 select-all">
                {instance.manifest_url || 'URL disponible dès la première publication'}
              </span>
              {instance.manifest_url && (
                <button
                  onClick={handleCopyManifest}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copié !' : 'Copier'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => navigate(`/instances/${instance.id}/files`)}
              className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <FolderOpen className="w-6 h-6 text-indigo-500 mb-2" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Explorateur de fichiers</h3>
                <p className="text-xs text-zinc-500 mt-1">Glissez-déposez vos mods, modifiez vos fichiers de config et gérez vos dossiers.</p>
              </div>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-4 flex items-center gap-1">
                Ouvrir l'explorateur →
              </span>
            </div>

            <div
              onClick={() => navigate(`/instances/${instance.id}/launcher`)}
              className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <Monitor className="w-6 h-6 text-indigo-500 mb-2" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Personnaliser le Launcher</h3>
                <p className="text-xs text-zinc-500 mt-1">Définissez vos logos, couleurs, modèle visuel et générez les exécutables des joueurs.</p>
              </div>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-4 flex items-center gap-1">
                Gérer le launcher →
              </span>
            </div>

            <div
              onClick={() => navigate(`/instances/${instance.id}/publications`)}
              className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <History className="w-6 h-6 text-indigo-500 mb-2" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Historique & Rollback</h3>
                <p className="text-xs text-zinc-500 mt-1">Visualisez les versions antérieures et revenez en arrière en un clic si nécessaire.</p>
              </div>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-4 flex items-center gap-1">
                Voir l'historique →
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Embedded Files Explorer */}
      {subTab === 'files' && instance.endpoint_id && (
        <ExplorerPage endpointId={instance.endpoint_id} />
      )}

      {/* Tab 3: Embedded Publications & Rollback */}
      {subTab === 'publications' && instance.endpoint_id && (
        <VersionsPage endpointId={instance.endpoint_id} />
      )}

      {/* Tab 4: Embedded Launcher Studio */}
      {subTab === 'launcher' && (
        <InstanceLauncherTab instance={instance} onRefresh={loadInstance} />
      )}

      {/* Tab 5: Embedded Game Settings */}
      {subTab === 'settings' && (
        <InstanceSettingsTab instance={instance} onRefresh={loadInstance} />
      )}
    </div>
  );
};
