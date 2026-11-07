import { useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../i18n';
import { locale } from '../../i18n/format';
import type { MinecraftInstance } from '../../types';

interface GameLog {
  id: string;
  player: string;
  exit_code: number;
  created_at: string;
}

export function InstancePlayerServices({ instance, onRefresh }: {
  instance: MinecraftInstance;
  onRefresh: () => void;
}) {
  const { language } = useTranslation();
  const { toast } = useToast();
  const text = (fr: string, en: string) => language === 'fr' ? fr : en;
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<GameLog[]>();
  const [selected, setSelected] = useState<{ id: string; log: string }>();
  const [loading, setLoading] = useState(false);
  const base = `/v2/instances/${instance.id}`;

  async function saveBackup(enabled: boolean) {
    setSaving(true);
    try {
      await api.put(`${base}/player-options-backup`, { enabled });
      onRefresh();
    } catch { toast.error(text('Impossible de modifier la sauvegarde.', 'Could not change the backup setting.')); }
    finally { setSaving(false); }
  }

  async function loadLogs(id?: string) {
    setLoading(true);
    try {
      if (id) {
        const { log } = await api.get<{ log: string }>(`${base}/player-game-logs/${id}`);
        setSelected({ id, log });
      } else {
        const result = await api.get<{ logs: GameLog[] }>(`${base}/player-game-logs`);
        setLogs(result.logs);
        setSelected(undefined);
      }
    } catch { toast.error(text('Impossible de charger les diagnostics.', 'Could not load the diagnostics.')); }
    finally { setLoading(false); }
  }

  return <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-5">
    <div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={!!instance.player_options_backup} disabled={saving}
          onChange={event => void saveBackup(event.target.checked)} />
        {text('Autoriser la sauvegarde des options Minecraft', 'Allow Minecraft options backups')}
      </label>
      <p className="text-xs text-zinc-500 mt-1">{text('Les joueurs peuvent activer la sauvegarde chiffrée et récupérer leurs options avec leur clé.', 'Players can enable encrypted backups and recover their options with their key.')}</p>
    </div>
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{text('Diagnostics des joueurs', 'Player diagnostics')}</h3>
        <button type="button" disabled={loading} onClick={() => void loadLogs()} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
          {logs ? text('Actualiser', 'Refresh') : text('Afficher les diagnostics', 'Show diagnostics')}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-1">{text('Jusqu’à 200 sessions sur 30 jours. Les pseudos sont déclarés par les joueurs, qui peuvent désactiver l’envoi.', 'Up to 200 sessions over 30 days. Players report their own nicknames and can turn sharing off.')}</p>
      {logs && (logs.length ? <div className="mt-3 max-h-64 overflow-y-auto">
        {logs.map(report => <button key={report.id} type="button" disabled={loading} aria-pressed={selected?.id === report.id}
          className="block w-full text-left text-xs py-2 px-2 border-b border-zinc-200 dark:border-zinc-800 hover:bg-indigo-500/10 aria-pressed:bg-indigo-500/10"
          onClick={() => void loadLogs(report.id)}>
          <strong>{report.player}</strong> · {new Date(report.created_at).toLocaleString(locale())} · {text('Code de sortie', 'Exit code')} {report.exit_code}
        </button>)}
      </div> : <p className="text-xs mt-3">{text('Aucun diagnostic disponible.', 'No diagnostics available.')}</p>)}
      {selected && <pre tabIndex={0} className="mt-3 text-xs p-3 bg-zinc-100 dark:bg-zinc-950 rounded max-h-96 overflow-auto whitespace-pre-wrap break-words">{selected.log}</pre>}
    </div>
  </section>;
}
