import React, { useEffect, useState } from 'react';
import {
  Server,
  HardDrive,
  Cpu,
  ArrowUpRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import { DashboardStats, Endpoint, Job } from '../types';
import { useTranslation } from '../i18n';

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
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await api.get<DashboardData>('/stats/dashboard');
      setData(res);
    } catch (e) {
      console.error('Error loading dashboard', e);
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
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight font-sans">
            {t('dashboard.title')}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <button
          onClick={() => onNavigate('endpoints')}
          className="inline-flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-xs transition self-start sm:self-auto"
        >
          <span>{t('dashboard.create_endpoint')}</span>
          <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Endpoints */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('dashboard.endpoints_count')}
            </span>
            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {s?.totalEndpoints || 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {s?.activeReleases || 0} active release(s)
            </div>
          </div>
        </div>

        {/* Physical Storage (CAS) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('dashboard.physical_storage')}
            </span>
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {formatBytes(s?.physicalBytes || 0)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">
              {s?.physicalObjects || 0} CAS objects
            </div>
          </div>
        </div>

        {/* Deduplication Savings */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('dashboard.dedup_ratio')}
            </span>
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {s?.deduplicationRatio || '1.00'}x
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {formatBytes(s?.savedBytes || 0)} saved
            </div>
          </div>
        </div>

        {/* Disk Free / Total */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('dashboard.storage_health')}
            </span>
            <div className="w-2 h-2 rounded-full bg-zinc-400"></div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {formatBytes(s?.diskFree || 0)}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Free of {formatBytes(s?.diskTotal || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Endpoints Table & Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Endpoints Table (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              {t('dashboard.recent_releases')}
            </h2>
            <button
              onClick={() => onNavigate('endpoints')}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
            >
              View all ({s?.totalEndpoints || 0})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Slug</th>
                  <th className="py-2.5 px-3">Active Version</th>
                  <th className="py-2.5 px-3">Files</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
                {(!data?.endpoints || data.endpoints.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-400 font-sans text-xs">
                      {t('dashboard.no_releases')}
                    </td>
                  </tr>
                ) : (
                  data.endpoints.slice(0, 5).map(ep => (
                    <tr
                      key={ep.id}
                      onClick={() => onNavigate(`endpoint:${ep.id}`)}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 cursor-pointer transition"
                    >
                      <td className="py-2.5 px-3 font-sans font-medium text-zinc-900 dark:text-zinc-100">
                        {ep.name}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500">
                        /{ep.slug}
                      </td>
                      <td className="py-2.5 px-3">
                        {ep.active_release_id ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                            {ep.active_release_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            draft
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500">
                        {ep.active_total_files || 0}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500">
                        {formatBytes(Number(ep.active_total_bytes || 0))}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition font-sans text-xs font-semibold">
                          Open →
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Jobs (1 col) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              {t('dashboard.active_jobs')}
            </h2>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
            >
              Logs
            </button>
          </div>

          <div className="space-y-2">
            {(!data?.recentJobs || data.recentJobs.length === 0) ? (
              <div className="py-8 text-center text-zinc-400 text-xs">
                No active background tasks
              </div>
            ) : (
              data.recentJobs.slice(0, 5).map(job => (
                <div
                  key={job.id}
                  className="p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center justify-between text-xs"
                >
                  <div className="truncate mr-2 font-mono">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate text-[11px]">
                      {job.job_type}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                        job.status === 'completed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                          : job.status === 'failed'
                          ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                          : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 animate-pulse'
                      }`}
                    >
                      {job.status}
                    </span>
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
