import React, { useEffect, useState } from 'react';
import {
  History,
  RotateCcw,
  Pin,
  FileCode,
  GitCompare,
  CheckCircle,
  Plus,
  Minus,
  Edit,
  Clock
} from 'lucide-react';
import { api } from '../api/client';
import { Release } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

interface VersionsPageProps {
  endpointId: string;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const VersionsPage: React.FC<VersionsPageProps> = ({ endpointId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [versions, setVersions] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  // Manifest viewer modal
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [selectedManifest, setSelectedManifest] = useState<any>(null);
  const [manifestReleaseId, setManifestReleaseId] = useState<string>('');

  // Diff modal
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [baseVersion, setBaseVersion] = useState<string>('');
  const [compareVersion, setCompareVersion] = useState<string>('');
  const [diffData, setDiffData] = useState<any>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadVersions = async () => {
    try {
      const res = await api.get<{ versions: Release[] }>(`/endpoints/${endpointId}/versions`);
      setVersions(res.versions);
    } catch (e: any) {
      toast.error('Erreur chargement des versions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [endpointId]);

  const handleTogglePin = async (ver: Release) => {
    try {
      const res = await api.post<{ success: boolean; isPinned: boolean }>(
        `/endpoints/${endpointId}/versions/${ver.id}/pin`
      );
      toast.success(res.isPinned ? 'Version épinglée (protégée de la purge)' : 'Épinglage retiré');
      loadVersions();
    } catch (e: any) {
      toast.error('Erreur modification épinglage');
    }
  };

  const handleRollback = async (ver: Release) => {
    if (!window.confirm(`Confirmez-vous le retour arrière atomique vers la version ${ver.release_id} ?`)) {
      return;
    }
    try {
      await api.post(`/endpoints/${endpointId}/versions/${ver.id}/rollback`);
      toast.success(`Retour arrière réussi vers ${ver.release_id} !`);
      loadVersions();
    } catch (e: any) {
      toast.error(e.message || 'Erreur rollback');
    }
  };

  const handleViewManifest = async (ver: Release) => {
    setManifestReleaseId(ver.release_id);
    setManifestModalOpen(true);
    try {
      const res = await api.get<{ version: Release }>(`/endpoints/${endpointId}/versions/${ver.id}`);
      setSelectedManifest(res.version.manifest_content);
    } catch (e: any) {
      toast.error('Impossible de charger le manifeste');
    }
  };

  const handleOpenDiff = (ver: Release) => {
    const active = versions.find(v => v.is_active);
    setBaseVersion(ver.release_id);
    setCompareVersion(active ? active.release_id : ver.release_id);
    setDiffModalOpen(true);
    triggerDiff(ver.release_id, active ? active.release_id : ver.release_id);
  };

  const triggerDiff = async (base: string, comp: string) => {
    if (!base || !comp) return;
    setDiffLoading(true);
    try {
      const res = await api.get(`/endpoints/${endpointId}/diff`, { base, compare: comp });
      setDiffData(res);
    } catch (e: any) {
      toast.error('Erreur comparaison diff');
    } finally {
      setDiffLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Historique des versions & Rollback
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Toutes les versions publiées sont immuables et archivées dans le CAS.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {versions.length === 0 ? (
          <div className="text-center py-12 px-4 text-xs text-slate-400">
            Aucune version pour le moment.
          </div>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Fichiers</th>
                <th className="py-3 px-4">Taille</th>
                <th className="py-3 px-4">Créé par</th>
                <th className="py-3 px-4">Date de publication</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {versions.map(ver => (
                <tr
                  key={ver.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                    ver.is_active ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                    <span className="mr-2">{ver.release_id}</span>
                    {ver.is_pinned && (
                      <span className="inline-flex items-center text-purple-600 dark:text-purple-400" title="Épinglée">
                        <Pin className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {ver.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                        <CheckCircle className="w-3 h-3 mr-1" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Archivée
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {ver.total_files}
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {formatBytes(Number(ver.total_bytes))}
                  </td>

                  <td className="py-3 px-4 text-slate-500">
                    {ver.created_by_username || 'Système'}
                  </td>

                  <td className="py-3 px-4 text-slate-500 text-xs">
                    {new Date(ver.created_at).toLocaleString('fr-FR')}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={() => handleViewManifest(ver)}
                        title="Voir le manifeste"
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <FileCode className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleOpenDiff(ver)}
                        title="Comparer avec une autre version"
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        <GitCompare className="w-4 h-4" />
                      </button>

                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleTogglePin(ver)}
                            title={ver.is_pinned ? 'Désépingler' : 'Épingler pour empêcher la purge'}
                            className={`p-1.5 rounded ${
                              ver.is_pinned
                                ? 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                                : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Pin className="w-4 h-4" />
                          </button>

                          {!ver.is_active && (
                            <button
                              onClick={() => handleRollback(ver)}
                              title="Restaurer immédiatement cette version"
                              className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manifest Viewer Modal */}
      <Modal
        isOpen={manifestModalOpen}
        onClose={() => setManifestModalOpen(false)}
        title={`Manifeste de version - ${manifestReleaseId}`}
        maxWidth="max-w-4xl"
      >
        <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-xs font-mono max-h-[70vh]">
          {selectedManifest ? JSON.stringify(selectedManifest, null, 2) : 'Chargement...'}
        </pre>
      </Modal>

      {/* Diff Modal */}
      <Modal
        isOpen={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        title={`Comparaison de versions (${baseVersion} ↔ ${compareVersion})`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-3 text-xs">
            <span className="font-semibold text-slate-500">Comparer :</span>
            <select
              value={baseVersion}
              onChange={e => {
                setBaseVersion(e.target.value);
                triggerDiff(e.target.value, compareVersion);
              }}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs"
            >
              {versions.map(v => (
                <option key={v.id} value={v.release_id}>
                  {v.release_id} {v.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <span className="text-slate-400">avec</span>
            <select
              value={compareVersion}
              onChange={e => {
                setCompareVersion(e.target.value);
                triggerDiff(baseVersion, e.target.value);
              }}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono text-xs"
            >
              {versions.map(v => (
                <option key={v.id} value={v.release_id}>
                  {v.release_id} {v.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {diffLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : !diffData ? null : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 font-semibold">
                  +{diffData.summary.addedCount} ajoutés
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-200 font-semibold">
                  -{diffData.summary.removedCount} supprimés
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 font-semibold">
                  ~{diffData.summary.modifiedCount} modifiés
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1 font-mono text-xs border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950">
                {diffData.added.map((f: any) => (
                  <div key={f.relative_path || f.path} className="text-emerald-600 dark:text-emerald-400 flex items-center">
                    <Plus className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>{f.relative_path || f.path}</span>
                  </div>
                ))}
                {diffData.removed.map((f: any) => (
                  <div key={f.relative_path || f.path} className="text-red-600 dark:text-red-400 flex items-center">
                    <Minus className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>{f.relative_path || f.path}</span>
                  </div>
                ))}
                {diffData.modified.map((f: any) => (
                  <div key={f.path} className="text-amber-600 dark:text-amber-400 flex items-center">
                    <Edit className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>{f.path}</span>
                  </div>
                ))}
                {diffData.summary.totalChanges === 0 && (
                  <div className="text-slate-400 text-center py-6">
                    Aucune différence entre ces deux versions.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
