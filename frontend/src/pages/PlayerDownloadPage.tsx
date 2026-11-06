import { useEffect, useState } from 'react';
import { ArrowDownToLine, Box, Check, Copy, Globe2, Laptop } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { formatBytes, locale } from '../i18n/format';
import landscape from '../../../packages/launcher/src/renderer/landscape.svg';

interface PlayerPack {
  name: string;
  description: string;
  release: { id: string; notes?: string; publishedAt?: string; minecraftVersion?: string; loader?: string };
  downloads: Array<{ platform: string; format?: 'zip' | 'installer'; version: string; bytes: number; sha256: string; url: string }>;
}

const systems: Record<string, string> = { windows: 'Windows', linux: 'Linux', macos: 'macOS' };

export function PlayerDownloadPage() {
  const { slug } = useParams();
  const { language, setLanguage } = useTranslation();
  const text = (fr: string, en: string) => language === 'fr' ? fr : en;
  const [pack, setPack] = useState<PlayerPack | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setPack(null);
    setCopied('');
    setStatus('loading');
    fetch(`/play-api/${encodeURIComponent(slug ?? '')}`, { signal: controller.signal, credentials: 'omit' })
      .then(async response => {
        if (response.status === 404) {
          setStatus('unavailable');
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        setPack(await response.json());
        setStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [slug, attempt]);

  const copy = async (sha256: string) => {
    try {
      await navigator.clipboard.writeText(sha256);
      setCopied(sha256);
    } catch {
      window.prompt(text('Copiez cette empreinte SHA‑256.', 'Copy this SHA‑256 checksum.'), sha256);
    }
  };

  return (
    <main className="min-h-screen bg-[#101318] text-white px-5 pb-14">
      <div className="max-w-5xl mx-auto">
        <header className="h-16 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-semibold"><Box className="size-5 text-indigo-400" /> PackPanel</span>
          <div className="flex items-center gap-2 text-xs">
            <Globe2 className="size-4 text-slate-400" />
            {(['fr', 'en'] as const).map(value => (
              <button key={value} type="button" lang={value} aria-pressed={language === value} onClick={() => setLanguage(value)}
                className={`rounded px-2 py-1 font-semibold ${language === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {status !== 'ready' || !pack ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 mt-10" aria-live="polite">
            <h1 className="text-xl font-semibold">
              {status === 'loading'
                ? text('Chargement du pack…', 'Loading the pack…')
                : status === 'unavailable' ? text('Ce téléchargement est indisponible.', 'This download is unavailable.')
                  : text('Impossible de joindre PackPanel.', 'Could not reach PackPanel.')}
            </h1>
            {status !== 'loading' && <button onClick={() => setAttempt(current => current + 1)} className="mt-4 text-indigo-300 hover:underline">
              {text('Réessayer', 'Try again')}
            </button>}
          </section>
        ) : (
          <>
            <section className="min-h-64 rounded-3xl border border-white/10 flex items-end p-7 md:p-10 bg-cover bg-center"
              style={{ backgroundImage: `linear-gradient(90deg, #101318f5, #10131861), url(${JSON.stringify(landscape)})` }}>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-indigo-200">Minecraft Java Edition</p>
                <h1 className="mt-3 text-3xl sm:text-5xl font-bold break-words">{pack.name}</h1>
                {pack.description && <p className="mt-4 max-w-xl text-sm text-slate-200 whitespace-pre-wrap break-words">{pack.description}</p>}
                <p className="mt-4 text-sm text-slate-300">
                  {[pack.release.minecraftVersion && `Minecraft ${pack.release.minecraftVersion}`, pack.release.loader,
                    pack.release.id].filter(Boolean).join(' · ')}
                </p>
              </div>
            </section>
            <section className="mt-8" aria-labelledby="downloads">
              <h2 id="downloads" className="text-xl font-semibold">{text('Télécharger le launcher', 'Download the launcher')}</h2>
              <p className="text-sm text-slate-300 mt-2">
                {text('Choisissez le téléchargement pour votre système.', 'Choose the download for your system.')}
              </p>
              <ul className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-3">
                {pack.downloads.map(download => (
                  <li key={download.platform} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col">
                    <h3 className="flex items-center gap-2 font-semibold"><Laptop className="size-4 text-indigo-300" />
                      {systems[download.platform] ?? text('Tous les systèmes', 'All platforms')} <span className="text-xs text-slate-400">x64</span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-2">v{download.version} · {formatBytes(download.bytes)}</p>
                    <p className="text-xs text-slate-300 mt-2 mb-4 break-words">
                      {download.format === 'installer'
                        ? text('Ouvrez le fichier .exe. Le launcher sera disponible dans le menu Démarrer.', 'Open the .exe. The launcher will be available from the Start menu.')
                        : text('Extrayez tout le ZIP, puis ouvrez ', 'Extract the entire ZIP, then open ') + (
                          download.platform === 'windows' ? 'windows/electron.exe' :
                          download.platform === 'linux' ? 'linux/run-launcher.sh' :
                            download.platform === 'macos' ? 'macos/Electron.app' : 'README.txt')}
                    </p>
                    <a href={download.url} className="mt-auto flex justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 py-2 text-sm font-semibold">
                      <ArrowDownToLine className="size-4" /> {download.format === 'installer'
                        ? text('Télécharger l’installateur (.exe)', 'Download installer (.exe)')
                        : text('Télécharger le ZIP', 'Download ZIP')}
                    </a>
                    {download.sha256 && <button onClick={() => copy(download.sha256)} className="flex justify-center items-center gap-2 mt-3 text-xs text-slate-300 hover:text-white">
                      {copied === download.sha256 ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copied === download.sha256 ? text('Empreinte copiée', 'Checksum copied') : text('Copier le SHA‑256', 'Copy SHA‑256')}
                    </button>}
                  </li>
                ))}
              </ul>
            </section>
            {pack.release.notes && <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold">{text('Notes de version', 'Release notes')}</h2>
              {pack.release.publishedAt && <time className="block text-xs text-slate-400 mt-1" dateTime={pack.release.publishedAt}>
                {new Date(pack.release.publishedAt).toLocaleDateString(locale())}
              </time>}
              <p className="mt-4 whitespace-pre-wrap break-words text-slate-200">{pack.release.notes}</p>
            </section>}
          </>
        )}
      </div>
    </main>
  );
}
