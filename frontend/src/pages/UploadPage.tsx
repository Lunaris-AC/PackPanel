import React, { useState, useRef } from 'react';
import * as tus from 'tus-js-client';
import {
  UploadCloud,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Clock
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';

interface UploadPageProps {
  endpointId: string;
  onSuccess: () => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({ endpointId, onSuccess }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'add_replace' | 'full_replace'>('add_replace');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Upload status
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [published, setPublished] = useState(false);

  // 1. Create a session if not created
  const ensureSession = async () => {
    if (activeSessionId) return activeSessionId;
    const res = await api.post<{ session: { id: string } }>(
      `/endpoints/${endpointId}/uploads/sessions`,
      { mode, sourceType: 'manual' }
    );
    setActiveSessionId(res.session.id);
    return res.session.id;
  };

  // 2. Direct ZIP upload
  const handleZipSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setCurrentFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
      const res = await api.post<{ sessionId: string; jobId: string }>(
        `/endpoints/${endpointId}/uploads/zip`,
        formData
      );
      toast.success('Archive ZIP téléversée avec succès ! Traitement et extraction en cours.');
      setActiveSessionId(res.sessionId);
      setPublished(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Échec du téléversement du ZIP');
    } finally {
      setUploading(false);
    }
  };

  // 3. TUS Chunked Resumable Upload
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setTotalCount(files.length);
    setProcessedCount(0);
    setPublished(false);

    try {
      const sessionId = await ensureSession();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        setProgress(0);

        // Calculate relative path if webkitRelativePath exists
        const relPath = file.webkitRelativePath || file.name;

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: '/api/uploads/tus',
            retryDelays: [0, 1000, 3000, 5000],
            chunkSize: 8 * 1024 * 1024, // 8MB chunks
            metadata: {
              endpointId,
              sessionId,
              relativePath: relPath,
              isZip: 'false'
            },
            onError: error => {
              console.error('Erreur tus:', error);
              reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100);
              setProgress(pct);
            },
            onSuccess: () => {
              setProcessedCount(prev => prev + 1);
              resolve();
            }
          });

          upload.start();
        });
      }

      toast.success('Tous les fichiers ont été transférés et mis en file de hachage.');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du transfert de fichiers');
    } finally {
      setUploading(false);
    }
  };

  // 4. Commit and Publish Session
  const handleCommit = async () => {
    if (!activeSessionId) return;

    setCommitting(true);
    try {
      await api.post(`/endpoints/${endpointId}/uploads/sessions/${activeSessionId}/commit`);
      toast.success('Version assemblée et publiée avec succès !');
      setPublished(true);
      setActiveSessionId(null);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Erreur publication version');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Mode Selection Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Mode de déploiement
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Choisissez la stratégie d'intégration des fichiers téléversés avec la version active.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label
            className={`flex items-start p-4 rounded-xl border cursor-pointer transition ${
              mode === 'add_replace'
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <input
              type="radio"
              name="mode"
              value="add_replace"
              checked={mode === 'add_replace'}
              onChange={() => setMode('add_replace')}
              disabled={uploading || !!activeSessionId}
              className="mt-1 text-brand-600 focus:ring-brand-500"
            />
            <div className="ml-3">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ajout & Remplacement ciblé
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Conserve tous les fichiers de la version active et met à jour uniquement les fichiers envoyés. Idéal pour des mises à jour de mods ou corrections mineures.
              </span>
            </div>
          </label>

          <label
            className={`flex items-start p-4 rounded-xl border cursor-pointer transition ${
              mode === 'full_replace'
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <input
              type="radio"
              name="mode"
              value="full_replace"
              checked={mode === 'full_replace'}
              onChange={() => setMode('full_replace')}
              disabled={uploading || !!activeSessionId}
              className="mt-1 text-brand-600 focus:ring-brand-500"
            />
            <div className="ml-3">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Remplacement complet (Snapshot)
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                La nouvelle version contiendra exclusivement les fichiers téléversés dans ce lot. Supprime les fichiers absents de cet envoi.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Upload Methods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Method 1: Chunked TUS Files / Folder */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-3 w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Téléversement par lot (TUS Chunks)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Protocole de téléversement découpé en morceaux résistant aux déconnexions. Supporte l'envoi de plusieurs fichiers en conservant l'arborescence.
            </p>
          </div>

          <div className="mt-6">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow transition disabled:opacity-60"
            >
              Sélectionner des fichiers
            </button>
          </div>
        </div>

        {/* Method 2: ZIP Archive Import */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-3 w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4">
              <FileArchive className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Import d'archive ZIP
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Extrait, valide contre les zip-bombs et les traversées de répertoires, vérifie que ce n'est pas un manifest Modrinth/CurseForge nu, et publie automatiquement.
            </p>
          </div>

          <div className="mt-6">
            <input
              type="file"
              accept=".zip"
              ref={zipInputRef}
              onChange={handleZipSelected}
              className="hidden"
            />
            <button
              onClick={() => zipInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl shadow transition disabled:opacity-60"
            >
              Téléverser une archive ZIP
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Live Status Box */}
      {uploading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate mr-2">
              Téléversement en cours : {currentFileName}
            </span>
            <span className="font-mono text-brand-600 font-bold">{progress}%</span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-brand-500 h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          {totalCount > 1 && (
            <div className="text-[11px] text-slate-400">
              Fichiers transférés : {processedCount} / {totalCount}
            </div>
          )}
        </div>
      )}

      {/* Pending Session Confirmation Card */}
      {activeSessionId && !published && !uploading && (
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Fichiers prêts pour publication
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Session active : <code className="font-mono text-[11px]">{activeSessionId}</code>. Vous pouvez continuer d'ajouter des fichiers ou finaliser la version.
              </p>
            </div>
          </div>

          <button
            onClick={handleCommit}
            disabled={committing}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-brand-600/30 flex items-center space-x-2 transition shrink-0 disabled:opacity-60"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{committing ? 'Publication...' : 'Publier la version'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
