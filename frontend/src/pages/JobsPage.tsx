import { locale } from '../i18n/format';
import { useTranslation } from '../i18n';
import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  RefreshCw,
  Ban,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import { Job } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { translateApiMessage } from '../i18n/text';

export const JobsPage: React.FC = () => {
  const { tr, language } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const canManage = user?.role === 'admin' || user?.role === 'operator';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      const res = await api.get<{ jobs: Job[] }>('/jobs', filter ? { status: filter } : undefined);
      setJobs(res.jobs);
    } catch (e: any) {
      toast.error(tr("Erreur chargement des tâches"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, [filter]);

  const handleCancel = async (jobId: string) => {
    try {
      await api.post(`/jobs/${jobId}/cancel`);
      toast.success(tr("Tâche annulée"));
      loadJobs();
    } catch (err: any) {
      toast.error(err.message || tr("Impossible d’annuler la tâche"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {tr("Tâches d'arrière-plan")} </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("File de traitement asynchrone PostgreSQL (hachage dual, extraction zip, publication atomique, GC)")} </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Status filters */}
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{tr("Tous les statuts")}</option>
            <option value="pending">{tr("En attente")}</option>
            <option value="running">{tr("En cours d'exécution")}</option>
            <option value="completed">{tr("Terminées")}</option>
            <option value="failed">{tr("En échec")}</option>
          </select>

          <button
            onClick={loadJobs}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
            title={tr("Rafraîchir")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 px-4 text-xs text-slate-400">
            {tr("Aucune tâche trouvée pour ce filtre.")} </div>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-3 px-4">{tr("Tâche")}</th>
                <th className="py-3 px-4">{tr("Statut")}</th>
                <th className="py-3 px-4">{tr("Priorité")}</th>
                <th className="py-3 px-4">{tr("Tentatives")}</th>
                <th className="py-3 px-4">{tr("Création")}</th>
                <th className="py-3 px-4">{tr("Détails / Erreur")}</th>
                <th className="py-3 px-4 text-right">{tr("Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {j.job_type}
                  </td>

                  <td className="py-3 px-4">
                    {j.status === 'completed' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle className="w-3 h-3 mr-1" />  {tr("Terminé")} </span>
                    )}
                    {j.status === 'running' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 animate-pulse">
                        <Cpu className="w-3 h-3 mr-1" />  {tr("En cours")} </span>
                    )}
                    {j.status === 'pending' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                        <Clock className="w-3 h-3 mr-1" />  {tr("En attente")} </span>
                    )}
                    {j.status === 'failed' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                        <XCircle className="w-3 h-3 mr-1" />  {tr("Échec")} </span>
                    )}
                    {j.status === 'cancelled' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {tr("Annulé")} </span>
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                    {j.priority}
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {j.attempts} / {j.max_attempts}
                  </td>

                  <td className="py-3 px-4 text-slate-500 text-xs">
                    {new Date(j.created_at).toLocaleTimeString(locale())}
                  </td>

                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate text-xs" title={translateApiMessage(j.error_message || '', language)}>
                    {j.error_message ? (
                      <span className="text-red-500 font-medium">{translateApiMessage(j.error_message, language)}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    {canManage && j.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(j.id)}
                        title={tr("Annuler cette tâche")}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
