import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Sparkles,
  Upload,
  Download,
  Check,
  CheckCircle2,
  ExternalLink,
  Layers,
  Palette,
  Shield,
  FileArchive,
  RefreshCw,
  Play,
  Globe,
  MessageSquare,
  HelpCircle,
  Clock
} from 'lucide-react';
import { api } from '../../api/client';
import { MinecraftInstance, LauncherProjectWithBuilds, LauncherBuild } from '../../types';
import { useToast } from '../../components/Toast';

interface InstanceLauncherTabProps {
  instance: MinecraftInstance;
  onRefresh: () => void;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const InstanceLauncherTab: React.FC<InstanceLauncherTabProps> = ({ instance, onRefresh }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [targetOs, setTargetOs] = useState<'windows' | 'linux' | 'macos' | 'all'>('windows');
  const [builds, setBuilds] = useState<LauncherBuild[]>([]);

  // Launcher Config State
  const launcher = instance.launcher;
  const isEnabled = Boolean(instance.launcher_enabled && launcher);

  const [title, setTitle] = useState(launcher?.title || `${instance.name} Launcher`);
  const [template, setTemplate] = useState<'minimal' | 'community' | 'network'>(launcher?.template || 'community');
  const [accentColor, setAccentColor] = useState(launcher?.accent_color || '#6366f1');
  const [backgroundUrl, setBackgroundUrl] = useState(launcher?.background_url || '');
  const [logoUrl, setLogoUrl] = useState(launcher?.logo_url || '');
  const [authMicrosoft, setAuthMicrosoft] = useState(launcher?.auth_microsoft ?? true);
  const [authOffline, setAuthOffline] = useState(launcher?.auth_offline ?? true);
  const [discordUrl, setDiscordUrl] = useState(launcher?.discord_url || '');
  const [websiteUrl, setWebsiteUrl] = useState(launcher?.website_url || '');

  // File upload refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  // Sync state when instance updates
  useEffect(() => {
    if (launcher) {
      setTitle(launcher.title || `${instance.name} Launcher`);
      setTemplate(launcher.template || 'community');
      setAccentColor(launcher.accent_color || '#6366f1');
      setBackgroundUrl(launcher.background_url || '');
      setLogoUrl(launcher.logo_url || '');
      setAuthMicrosoft(launcher.auth_microsoft ?? true);
      setAuthOffline(launcher.auth_offline ?? true);
      setDiscordUrl(launcher.discord_url || '');
      setWebsiteUrl(launcher.website_url || '');
      setBuilds(launcher.builds || []);
    }
  }, [launcher, instance.name]);

  const loadBuilds = async () => {
    try {
      const res = await api.get<{ builds: LauncherBuild[] }>(`/v2/instances/${instance.id}/launcher/builds`);
      setBuilds(res.builds || []);
    } catch (err) {
      console.error('Failed to load builds', err);
    }
  };

  const handleEnableLauncher = async () => {
    try {
      setLoading(true);
      await api.post(`/v2/instances/${instance.id}/launcher/enable`);
      toast.success('Launcher personnalisé activé pour cette instance !');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'activation du launcher");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableLauncher = async () => {
    if (!window.confirm('Désactiver le launcher pour cette instance ?')) return;
    try {
      setLoading(true);
      await api.post(`/v2/instances/${instance.id}/launcher/disable`);
      toast.success('Launcher désactivé');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'bg') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);

    try {
      if (type === 'logo') setUploadingLogo(true);
      else setUploadingBg(true);

      const res = await api.post<{ url: string; sha256: string }>(`/v2/instances/${instance.id}/launcher/media`, fd);
      if (type === 'logo') {
        setLogoUrl(res.url);
      } else {
        setBackgroundUrl(res.url);
      }
      toast.success(`Image ${type === 'logo' ? 'Logo' : 'Arrière-plan'} téléversée avec succès dans le CAS !`);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du téléversement');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingBg(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.put(`/v2/instances/${instance.id}/launcher`, {
        title,
        template,
        accentColor,
        backgroundUrl: backgroundUrl || null,
        logoUrl: logoUrl || null,
        authMicrosoft,
        authOffline,
        discordUrl: discordUrl || null,
        websiteUrl: websiteUrl || null
      });
      toast.success('Paramètres du launcher enregistrés !');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l’enregistrement');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerBuild = async () => {
    try {
      setBuilding(true);
      toast.info('Génération de l’exécutable launcher en cours...');
      const res = await api.post<{ success: boolean; build: LauncherBuild }>(
        `/v2/instances/${instance.id}/launcher/build`,
        { targetOs }
      );
      toast.success(`Build ${res.build.version} généré avec succès !`);
      loadBuilds();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la génération du launcher');
    } finally {
      setBuilding(false);
    }
  };

  if (!isEnabled) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 text-center max-w-2xl mx-auto shadow-xs">
        <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-900/50">
          <Monitor className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Launcher personnalisé pour {instance.name}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
          Offrez à vos joueurs un launcher autonome et personnalisé à vos couleurs. Il gère l'installation de Java, la synchronisation automatique des mods et le lancement sécurisé sans dépendre d'aucune solution tierce.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Autonomie totale</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Moteur PackPanel indépendant, aucune API EML ou tierce nécessaire.</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Personnalisation UI</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Logo, fond d'écran, modèle visuel (Minimal, Community, Network).</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">Exécutable prêt</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">Génération d'archives prêtes au téléchargement avec checksum SHA-256.</p>
          </div>
        </div>

        <button
          onClick={handleEnableLauncher}
          disabled={loading}
          className="mt-8 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {loading ? 'Activation...' : 'Activer le launcher pour cette instance'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Bar with Status and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {title || 'Launcher personnalisé'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Actif
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono">Modèle : {template.toUpperCase()}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDisableLauncher}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
          >
            Désactiver
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Settings Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-500" />
                Personnalisation & Identité
              </h3>
            </div>

            {/* Title & Accent Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Titre du Launcher
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Couleur d'accent
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={e => setAccentColor(e.target.value)}
                    className="h-8 w-10 border-0 p-0 rounded cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={e => setAccentColor(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Modèle d'interface (Template)
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'minimal', title: 'Minimal', desc: '1 bouton Jouer épuré' },
                  { id: 'community', title: 'Community', desc: 'Actualités & Discord' },
                  { id: 'network', title: 'Network', desc: 'Sélecteur de serveurs' }
                ].map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setTemplate(tpl.id as any)}
                    className={`p-3 rounded-xl border text-left transition ${
                      template === tpl.id
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950/40'
                    }`}
                  >
                    <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{tpl.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{tpl.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Media Uploads: Logo & Background (Direct into CAS) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {/* Logo */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Logo personnalisé (PNG transparent recommandé)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={logoInputRef}
                    onChange={e => handleUploadFile(e, 'logo')}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Envoi...' : 'Téléverser logo'}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {logoUrl && (
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 truncate max-w-xs">{logoUrl}</p>
                )}
              </div>

              {/* Background */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Arrière-plan (1920x1080 recommandé)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={bgInputRef}
                    onChange={e => handleUploadFile(e, 'bg')}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bgInputRef.current?.click()}
                    disabled={uploadingBg}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingBg ? 'Envoi...' : 'Téléverser fond'}
                  </button>
                  {backgroundUrl && (
                    <button
                      type="button"
                      onClick={() => setBackgroundUrl('')}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {backgroundUrl && (
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 truncate max-w-xs">{backgroundUrl}</p>
                )}
              </div>
            </div>

            {/* Auth Providers */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Fournisseurs d'authentification autorisés
              </span>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authMicrosoft}
                    onChange={e => setAuthMicrosoft(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-zinc-800 dark:text-zinc-200">Compte officiel Microsoft</span>
                </label>
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authOffline}
                    onChange={e => setAuthOffline(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-zinc-800 dark:text-zinc-200">Mode Offline (Pseudonyme libre)</span>
                </label>
              </div>
            </div>

            {/* Social Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Lien Discord communautaire
                </label>
                <input
                  type="text"
                  value={discordUrl}
                  onChange={e => setDiscordUrl(e.target.value)}
                  placeholder="https://discord.gg/monserveur"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Site Web officiel
                </label>
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="https://monserveur.fr"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-xs transition"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer la configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Col: Live Preview & Generator (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live UI Preview */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Aperçu en direct du launcher
            </h3>

            {/* Window Container */}
            <div className="rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700/80 shadow-md bg-zinc-950 text-white relative">
              {/* Window Titlebar */}
              <div className="h-6 bg-zinc-900 px-3 flex items-center justify-between text-[10px] font-mono text-zinc-400 border-b border-zinc-800">
                <span className="truncate">{title || 'Mon Launcher'}</span>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
                  <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
                  <span className="w-2 h-2 rounded-full bg-rose-500/80"></span>
                </div>
              </div>

              {/* Window Body Mockup */}
              <div
                className="h-56 relative flex flex-col justify-between p-4 bg-cover bg-center transition-all duration-300"
                style={{
                  backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
                  backgroundColor: backgroundUrl ? undefined : '#09090b'
                }}
              >
                {/* Overlay gradient for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30 pointer-events-none" />

                {/* Top header inside launcher */}
                <div className="relative z-10 flex items-center justify-between">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-7 max-w-[120px] object-contain" />
                  ) : (
                    <span className="font-extrabold text-sm tracking-tight text-white drop-shadow">
                      {title}
                    </span>
                  )}

                  <div className="flex items-center space-x-2 text-[10px]">
                    {discordUrl && (
                      <span className="px-1.5 py-0.5 rounded bg-white/10 backdrop-blur-xs flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5" /> Discord
                      </span>
                    )}
                    {websiteUrl && (
                      <span className="px-1.5 py-0.5 rounded bg-white/10 backdrop-blur-xs flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5" /> Web
                      </span>
                    )}
                  </div>
                </div>

                {/* Center / Template Content */}
                <div className="relative z-10">
                  {template === 'community' && (
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-lg p-2 max-w-[200px]">
                      <span className="text-[9px] font-bold uppercase text-white/80 block">Actualités</span>
                      <p className="text-[10px] text-zinc-300 line-clamp-1">Bienvenue sur la mise à jour {instance.minecraft_version} !</p>
                    </div>
                  )}
                  {template === 'network' && (
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-lg p-2 max-w-[220px]">
                      <span className="text-[9px] font-bold uppercase text-white/80 block">Serveur principal</span>
                      <p className="text-[10px] text-emerald-400 font-mono">En ligne • {instance.server_address || 'play.server.net'}</p>
                    </div>
                  )}
                </div>

                {/* Bottom Bar inside launcher */}
                <div className="relative z-10 flex items-center justify-between pt-2 border-t border-white/15">
                  <div className="text-[10px] text-zinc-300">
                    <span className="font-bold text-white block">{instance.name}</span>
                    <span className="text-zinc-400 font-mono text-[9px]">{instance.minecraft_version} • {instance.loader_type}</span>
                  </div>

                  <button
                    type="button"
                    style={{ backgroundColor: accentColor }}
                    className="px-4 py-1.5 rounded-lg text-white font-bold text-xs shadow-lg hover:brightness-110 transition flex items-center gap-1.5 pointer-events-none"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    JOUER
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Real Build Generator Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <FileArchive className="w-4 h-4 text-indigo-500" />
                Générer les exécutables du launcher
              </h3>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Génère le package d'installation complet autonome pour vos joueurs, incluant le runtime PackPanel, les scripts de démarrage et la configuration signée.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'windows', label: 'Windows (.zip / .bat)' },
                { id: 'linux', label: 'Linux (.zip / .sh)' },
                { id: 'macos', label: 'macOS (.zip)' },
                { id: 'all', label: 'Toutes les plateformes' }
              ].map(os => (
                <button
                  key={os.id}
                  type="button"
                  onClick={() => setTargetOs(os.id as any)}
                  className={`p-2.5 rounded-lg border text-left text-xs transition ${
                    targetOs === os.id
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold text-indigo-700 dark:text-indigo-300'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                  }`}
                >
                  {os.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleTriggerBuild}
              disabled={building}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {building ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Génération en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Générer le launcher ({targetOs.toUpperCase()})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Builds History Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Download className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Historique des builds & Téléchargements
            </h3>
          </div>
          <button
            onClick={loadBuilds}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg transition"
            title="Rafraîchir les builds"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {builds.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            Aucun build généré pour l'instant. Cliquez sur "Générer le launcher" ci-dessus pour produire votre premier exécutable.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 uppercase font-mono text-[10px] border-y border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Plateforme</th>
                  <th className="py-2.5 px-3">Taille</th>
                  <th className="py-2.5 px-3">Empreinte SHA-256</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {builds.map(b => (
                  <tr key={b.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-3 font-bold text-zinc-900 dark:text-zinc-100">
                      v{b.version}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {b.target_os}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                      {formatBytes(b.artifact_size)}
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px] text-zinc-400 truncate max-w-xs" title={b.sha256}>
                      {b.sha256 ? `${b.sha256.substring(0, 16)}...` : '-'}
                    </td>
                    <td className="py-3 px-3 text-zinc-500 text-[11px]">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <a
                        href={`/api/v2/instances/${instance.id}/launcher/builds/${b.id}/download`}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Télécharger
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
