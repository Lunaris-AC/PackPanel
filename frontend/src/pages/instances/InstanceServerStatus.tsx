import { useState } from 'react';
import { Server } from 'lucide-react';
import { ApiError, api } from '../../api/client';
import { useTranslation } from '../../i18n';
import { locale } from '../../i18n/format';

type ServerStatus =
  | { status: 'online'; latencyMs: number; players: { online: number; max: number } | null; checkedAt: string }
  | { status: 'no_response' | 'invalid_address' | 'private_address' | 'unresolved' | 'busy' | 'changed' | 'error' };

export function InstanceServerStatus({ id, address }: { id: string; address: string }) {
  const { language } = useTranslation();
  const text = (fr: string, en: string) => language === 'fr' ? fr : en;
  const storageKey = `packpanel:server-status:${id}:${address}`;
  const [lastSuccess, setLastSuccess] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored && Number.isFinite(Date.parse(stored)) ? stored : null;
    } catch {
      return null;
    }
  });
  const [result, setResult] = useState<ServerStatus | null>(null);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    try {
      const response = await api.post<ServerStatus & { address: string | null }>(`/v2/instances/${id}/server-status`);
      if (response.address !== address) {
        setResult({ status: 'changed' });
        return;
      }
      setResult(response);
      if (response.status === 'online') {
        setLastSuccess(response.checkedAt);
        try { localStorage.setItem(storageKey, response.checkedAt); } catch { /* Keep the result for this view. */ }
      }
    } catch (error) {
      setResult({ status: error instanceof ApiError && error.status === 429 ? 'busy' : 'error' });
    } finally {
      setTesting(false);
    }
  }

  const labels = {
    online: text('Minecraft répond', 'Minecraft is responding'),
    no_response: text('Aucune réponse Minecraft', 'No Minecraft response'),
    invalid_address: text('Adresse Minecraft invalide', 'Invalid Minecraft address'),
    private_address: text('Le test est réservé aux adresses publiques', 'The test is limited to public addresses'),
    unresolved: text('Adresse introuvable dans le DNS', 'Address could not be resolved'),
    busy: text('Un test est déjà en cours. Réessayez dans quelques secondes.', 'A test is already running. Try again in a few seconds.'),
    changed: text('L’adresse a changé. Actualisez cette page.', 'The address changed. Refresh this page.'),
    error: text('Le test a échoué. Réessayez.', 'The test failed. Try again.')
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-500" />
            {text('Santé du serveur', 'Server health')}
          </h2>
          <p className="text-xs text-zinc-500 mt-1 break-all font-mono">{address}</p>
        </div>
        <button type="button" onClick={() => void testConnection()} disabled={testing}
          className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 disabled:opacity-50">
          {testing ? text('Test en cours…', 'Testing…') : text('Tester la connexion', 'Test connection')}
        </button>
      </div>
      <div className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400" role="status">
        <p className={result?.status === 'online' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold'}>
          {testing ? text('Vérification depuis PackPanel…', 'Checking from PackPanel…')
            : result ? labels[result.status] : text('Aucun résultat pour ce test', 'No result for this test yet')}
        </p>
        {!testing && result?.status === 'online' && (
          <p>
            {text(`${result.latencyMs} ms depuis PackPanel`, `${result.latencyMs} ms from PackPanel`)}
            {result.players && ` · ${result.players.online}/${result.players.max} ${text('en ligne', 'online')}`}
          </p>
        )}
        {lastSuccess && (
          <p>
            {text('Dernière réponse réussie', 'Last successful response')} ·{' '}
            <time dateTime={lastSuccess}>{new Date(lastSuccess).toLocaleString(locale(language), { dateStyle: 'short', timeStyle: 'short' })}</time>
          </p>
        )}
      </div>
    </section>
  );
}
