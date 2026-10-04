import { formatBytes } from '../../i18n/format';
import { useTranslation } from '../../i18n';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Plus,
  Search,
  ExternalLink,
  FolderOpen,
  Send,
  Trash2,
  Sparkles,
  Monitor,
  CheckCircle2,
  AlertCircle,
  HardDrive
} from 'lucide-react';
import { api } from '../../api/client';
import { MinecraftInstance } from '../../types';
import { useToast } from '../../components/Toast';



export const InstancesListPage: React.FC = () => {
  const { tr } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [instances, setInstances] = useState<MinecraftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadInstances = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ instances: MinecraftInstance[] }>('/v2/instances');
      setInstances(res.instances || []);
    } catch (err: any) {
      toast.error(tr("Erreur lors du chargement des instances: ") + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const handleDelete = async (e: React.MouseEvent, inst: MinecraftInstance) => {
    e.stopPropagation();
    if (!window.confirm(tr("Supprimer définitivement l'instance \"{0}\" ({1}) ?", { 0: inst.name, 1: inst.slug }))) return;

    try {
      await api.delete(`/v2/instances/${inst.id}`);
      toast.success(tr("Instance supprimée"));
      loadInstances();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de la suppression"));
    }
  };

  const filteredInstances = instances.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.slug.toLowerCase().includes(search.toLowerCase()) ||
    i.minecraft_version.includes(search) ||
    i.loader_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Box className="w-5 h-5 text-indigo-500" />
            {tr("Instances Minecraft")} </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {tr("Chaque instance centralise vos versions, vos mods, vos règles de distribution et son launcher dédié.")} </p>
        </div>

        <button
          onClick={() => navigate('/instances/new')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          {tr("Nouvelle Instance")} </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tr("Rechercher par nom, version, loader...")}
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Instance Cards */}
      {loading ? (
        <div className="py-16 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <Box className="w-12 h-12 mx-auto text-zinc-400 mb-3" />
          <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">{tr("Aucune instance Minecraft")}</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            {tr("Commencez par créer votre première instance pour distribuer vos mods, packs et exécutables avec notre moteur Minecraft indépendant.")} </p>
          <button
            onClick={() => navigate('/instances/new')}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            {tr("Créer une instance")} </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredInstances.map(inst => {
            const isPublished = Boolean(inst.active_release_id);

            return (
              <div
                key={inst.id}
                onClick={() => navigate(`/instances/${inst.id}/overview`)}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:shadow-xs transition cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {/* Top Badge Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate">
                        {inst.name}
                      </h3>
                      <p className="text-[11px] font-mono text-zinc-400 truncate">
                        {inst.slug}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold shrink-0 ${
                      inst.loader_type === 'fabric'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                        : inst.loader_type === 'forge'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                        : inst.loader_type === 'neoforge'
                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
                        : inst.loader_type === 'quilt'
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}>
                      {inst.loader_type}
                    </span>
                  </div>

                  {inst.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2">
                      {inst.description}
                    </p>
                  )}

                  {/* Version & Specs */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-400 block font-medium">MINECRAFT</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{inst.minecraft_version}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 block font-medium">{tr("JAVA REQUIS")}</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">Java {inst.java_version}</span>
                    </div>
                    {inst.loader_version && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-zinc-400 block font-medium">{tr("VERSION DU LOADER")}</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400 text-[11px] truncate block">
                          {inst.loader_version}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                    {isPublished ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {tr("Publié (")}{inst.active_total_files || 0}  {tr("fichiers,")} {formatBytes(inst.active_total_bytes)})
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {tr("Brouillon non publié")} </span>
                    )}

                    {inst.launcher_enabled && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                        <Monitor className="w-3 h-3 mr-1" />
                        {tr("Launcher activé")} </span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold group-hover:underline flex items-center gap-1">
                    {tr("Ouvrir l'instance")} <ExternalLink className="w-3.5 h-3.5" />
                  </span>

                  <button
                    onClick={(e) => handleDelete(e, inst)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title={tr("Supprimer l'instance")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
