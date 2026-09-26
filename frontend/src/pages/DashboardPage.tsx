import React, { useEffect, useState } from 'react';
import {
  Server,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  ArrowUpRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import { DashboardStats, Endpoint, Job } from '../types';

interface DashboardData {
  summary: DashboardStats;
  endpoints: Endpoint[];
  recentJobs: Job[];
}

interface DashboardPageProps {
  onNavigate: (tab: string, meta?: any) => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await api.get<DashboardData>('/stats/dashboard');
      setData(res);
    } catch (e) {
      console.error('Erreur chargement dashboard', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-8">
      {/* Top Banner / Heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Vue d'ensemble
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Supervision de la distribution des packs, du stockage CAS et des traitements
          </p>
        </div>
        <button
          onClick={() => onNavigate('endpoints')}
          className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-600/20 transition self-start md:self-auto"
        >
          <span>Gérer les endpoints</span>
          <ArrowUpRight className="w-4 h-4 ml-1.5" />
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Endpoints */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Endpoints
            </span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Server className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {s?.totalEndpoints || 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {s?.activeReleases || 0} version(s) active(s) distribuée(s)
            </div>
          </div>
        </div>

        {/* Physical Storage (CAS) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Stockage Physique CAS
            </span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {formatBytes(s?.physicalBytes || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {s?.physicalObjects || 0} objet(s) unique(s)
            </div>
          </div>
        </div>

        {/* Deduplication Savings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Économie Déduplication
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatBytes(s?.savedBytes || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Ratio de compression : {s?.deduplicationRatio || '1.00'}x
            </div>
          </div>
        </div>

        {/* Disk Free / Total */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Disque Serveur
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {formatBytes(s?.diskFree || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Libre sur {formatBytes(s?.diskTotal || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Endpoints Table & Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Endpoints Table (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Endpoints récents
            </h2>
            <button
              onClick={() => onNavigate('endpoints')}
              className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
            >
              Voir tout ({s?.totalEndpoints || 0})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3">Nom</th>
                  <th className="pb-3">Slug</th>
                  <th className="pb-3">Version Active</th>
                  <th className="pb-3">Fichiers</th>
                  <th className="pb-3">Taille</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(!data?.endpoints || data.endpoints.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Aucun endpoint configuré. Créez-en un pour commencer !
                    </td>
                  </tr>
                ) : (
                  data.endpoints.map(ep => (
                    <tr
                      key={ep.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => onNavigate(`endpoint:${ep.id}`)}
                    >
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {ep.name}
                      </td>
                      <td className="py-3 font-mono text-xs text-slate-500">
                        {ep.slug}
                      </td>
                      <td className="py-3">
                        {ep.active_release_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            {ep.active_release_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Non publié
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">
                        {ep.active_total_files || 0}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">
                        {formatBytes(Number(ep.active_total_bytes) || 0)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(`endpoint:${ep.id}`);
                          }}
                          className="text-brand-600 hover:text-brand-500 font-medium text-xs p-1.5"
                        >
                          Ouvrir &rarr;
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Jobs Side Panel (1 col) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Traitements récents
            </h2>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline"
            >
              Historique
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {(!data?.recentJobs || data.recentJobs.length === 0) ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Aucune tâche récente
              </div>
            ) : (
              data.recentJobs.map(j => (
                <div
                  key={j.id}
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {j.job_type}
                    </p>
                    <p className="text-slate-400 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(j.created_at).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                  <div>
                    {j.status === 'completed' && (
                      <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Terminé
                      </span>
                    )}
                    {j.status === 'running' && (
                      <span className="inline-flex items-center text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                        <Cpu className="w-3.5 h-3.5 mr-1" /> En cours
                      </span>
                    )}
                    {j.status === 'pending' && (
                      <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium">
                        <Clock className="w-3.5 h-3.5 mr-1" /> En attente
                      </span>
                    )}
                    {j.status === 'failed' && (
                      <span className="inline-flex items-center text-red-600 dark:text-red-400 font-medium" title={j.error_message}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Échec
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
