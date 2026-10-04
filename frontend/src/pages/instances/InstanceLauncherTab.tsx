import { formatBytes, locale } from '../../i18n/format';
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
import { useTranslation } from '../../i18n';
import launcherLandscape from '../../../../packages/launcher/src/renderer/landscape.svg';

interface InstanceLauncherTabProps {
  instance: MinecraftInstance;
  onRefresh: () => void;
}



export const InstanceLauncherTab: React.FC<InstanceLauncherTabProps> = ({ instance, onRefresh }) => {
  const { toast } = useToast();
  const { tr, language } = useTranslation();
  const text = (fr: string, en: string) => language === 'fr' ? fr : en;
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
  const [authMicrosoft, setAuthMicrosoft] = useState(launcher?.auth_microsoft ?? false);
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
      setAuthMicrosoft(launcher.auth_microsoft ?? false);
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
      toast.success(tr("Launcher personnalisé activé pour cette instance !"));
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de l'activation du launcher"));
    } finally {
      setLoading(false);
    }
  };

  const handleDisableLauncher = async () => {
    if (!window.confirm(tr("Désactiver le launcher pour cette instance ?"))) return;
    try {
      setLoading(true);
      await api.post(`/v2/instances/${instance.id}/launcher/disable`);
      toast.success(tr("Launcher désactivé"));
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur"));
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
      toast.success(tr("Image {0} téléversée avec succès dans le CAS !", { 0: type === 'logo' ? 'Logo' : 'Arrière-plan' }));
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors du téléversement"));
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
      toast.success(tr("Paramètres du launcher enregistrés !"));
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de l’enregistrement"));
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerBuild = async () => {
    try {
      setBuilding(true);
      toast.info(tr("Génération de l’exécutable launcher en cours..."));
      const res = await api.post<{ success: boolean; build: LauncherBuild }>(
        `/v2/instances/${instance.id}/launcher/build`,
        { targetOs }
      );
      toast.success(tr("Build {0} généré avec succès !", { 0: res.build.version }));
      loadBuilds();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de la génération du launcher"));
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
          {tr("Launcher personnalisé pour")} {instance.name}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
          {tr("Offrez à vos joueurs un launcher autonome et personnalisé à vos couleurs. Il gère l'installation de Java, la synchronisation automatique des mods et le lancement sécurisé sans dépendre d'aucune solution tierce.")} </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">{tr("Autonomie totale")}</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">{tr("Moteur PackPanel indépendant, aucune API EML ou tierce nécessaire.")}</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">{tr("Personnalisation UI")}</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">{tr("Logo, fond d'écran, modèle visuel (Minimal, Community, Network).")}</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">{tr("Exécutable prêt")}</span>
            <p className="text-[11px] text-zinc-500 mt-0.5">{tr("Génération d'archives prêtes au téléchargement avec checksum SHA-256.")}</p>
          </div>
        </div>

        <button
          onClick={handleEnableLauncher}
          disabled={loading}
          className="mt-8 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {loading ? tr("Activation...") : tr("Activer le launcher pour cette instance")}
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
                {title || tr("Launcher personnalisé")}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {tr("Actif")} </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono">{tr("Modèle :")} {template.toUpperCase()}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDisableLauncher}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
          >
            {tr("Désactiver")} </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Settings Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-500" />
                {tr("Personnalisation & Identité")} </h3>
            </div>

            {/* Title & Accent Color */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {tr("Titre du Launcher")} </label>
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
                  {tr("Couleur d'accent")} </label>
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

            <p className="text-xs text-zinc-500">{tr("Le launcher est dédié à cette instance. Les joueurs saisissent leur pseudo et cliquent sur Jouer ; la mémoire, les arguments JVM et les fichiers du jeu sont accessibles dans les paramètres.")}</p>
            {/* Media Uploads: Logo & Background (Direct into CAS) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {/* Logo */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {tr("Logo personnalisé (PNG transparent recommandé)")} </label>
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
                    {uploadingLogo ? tr("Envoi...") : tr("Téléverser logo")}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      {tr("Retirer")} </button>
                  )}
                </div>
                {logoUrl && (
                  <p className="text-[10px] font-mono text-zinc-400 mt-1 truncate max-w-xs">{logoUrl}</p>
                )}
              </div>

              {/* Background */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {tr("Arrière-plan (1920x1080 recommandé)")} </label>
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
                    {uploadingBg ? tr("Envoi...") : tr("Téléverser fond")}
                  </button>
                  {backgroundUrl && (
                    <button
                      type="button"
                      onClick={() => setBackgroundUrl('')}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      {tr("Retirer")} </button>
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
                {tr("Fournisseurs d'authentification autorisés")} </span>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authMicrosoft}
                    onChange={e => setAuthMicrosoft(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-zinc-800 dark:text-zinc-200">{tr("Compte officiel Microsoft")}</span>
                </label>
                <label className="flex items-center space-x-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authOffline}
                    onChange={e => setAuthOffline(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-zinc-800 dark:text-zinc-200">{tr("Mode Offline (Pseudonyme libre)")}</span>
                </label>
              </div>
            </div>

            {/* Social Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {tr("Lien Discord communautaire")} </label>
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
                  {tr("Site Web officiel")} </label>
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
                {loading ? tr("Enregistrement...") : tr("Enregistrer la configuration")}
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
              {tr("Aperçu en direct du launcher")} </h3>

            {/* Preview mirrors the instance-bound desktop layout. */}
            <div className="rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700/80 shadow-md bg-[#101114] text-white">
              <div className="h-7 bg-[#141519] px-3 flex items-center justify-between text-[9px] border-b border-white/5">
                <span className="truncate font-semibold">{title || `${instance.name} Launcher`}</span>
                <div className="flex items-center gap-3 text-zinc-500"><span className="text-[8px]">FR / EN</span><span>−</span><span>□</span><span>×</span></div>
              </div>
              <div className="flex min-h-56">
                <div className="w-[75px] shrink-0 border-r border-white/5 bg-[#16171d] p-2 space-y-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="w-5 h-5 object-contain" /> : <Layers className="w-4 h-4" />}
                  </div>
                  <div className="text-[8px] rounded p-1.5" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>{text('Jouer', 'Play')}</div>
                  <div className="text-[8px] text-zinc-500 p-1.5">{text(tr("Paramètres"), 'Settings')}</div>
                </div>
                <div className="flex-1 min-w-0 p-3 space-y-3">
                  <div className="h-28 rounded-lg bg-cover bg-center relative overflow-hidden p-3" style={{ backgroundImage: `linear-gradient(90deg,#171b25ed,#171b2560),url(${JSON.stringify(backgroundUrl || launcherLandscape)})` }}>
                    <span className="text-[6px] tracking-widest text-zinc-400">{text('VOTRE PROCHAINE AVENTURE', 'YOUR NEXT ADVENTURE')}</span>
                    <div className="font-bold text-sm tracking-tight mt-2 truncate">{title}</div>
                    <span className="text-[8px] text-zinc-400 block mt-2">{instance.name}</span>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-[#1b1c23] p-2.5">
                    <div className="font-semibold text-[9px]">{text('L’aventure vous attend.', 'Your adventure awaits.')}</div>
                    <div className="flex gap-2 mt-2 items-center">
                      <div className="flex-1 min-w-0 rounded bg-[#111217] border border-white/5 px-2 py-1.5 text-[8px] text-zinc-500">{text('Votre pseudo', 'Your nickname')}</div>
                      <span style={{ backgroundColor: accentColor }} className="px-3 py-1.5 rounded text-white font-semibold text-[8px] flex items-center gap-1"><Play className="w-2 h-2 fill-white" />{text('Jouer', 'Play')}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-6 border-t border-white/5 px-3 flex items-center gap-1.5 text-[7px] text-zinc-500"><span className="w-1 h-1 rounded-full bg-emerald-400/60" />{text('Prêt à jouer.', 'Ready to play.')}</div>
            </div>
          </div>

          {/* Real Build Generator Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <FileArchive className="w-4 h-4 text-indigo-500" />
                {tr("Générer les exécutables du launcher")} </h3>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {text('Génère un launcher autonome dédié à cette instance, avec son runtime et sa configuration.', 'Builds a standalone launcher for this instance, including its runtime and configuration.')}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'windows', label: 'Windows (.zip / .bat)' },
                { id: 'linux', label: 'Linux (.zip / .sh)' },
                { id: 'macos', label: 'macOS (.zip)' },
                { id: 'all', label: tr("Toutes les plateformes") }
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
                  <span>{tr("Génération en cours...")}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{tr("Générer le launcher (")}{targetOs.toUpperCase()})</span>
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
              {tr("Historique des builds & Téléchargements")} </h3>
          </div>
          <button
            onClick={loadBuilds}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg transition"
            title={tr("Rafraîchir les builds")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {builds.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            {tr("Aucun build généré pour l'instant. Cliquez sur \"Générer le launcher\" ci-dessus pour produire votre premier exécutable.")} </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 uppercase font-mono text-[10px] border-y border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">{tr("Version")}</th>
                  <th className="py-2.5 px-3">{tr("Plateforme")}</th>
                  <th className="py-2.5 px-3">{tr("Taille")}</th>
                  <th className="py-2.5 px-3">{tr("Empreinte SHA-256")}</th>
                  <th className="py-2.5 px-3">{tr("Date")}</th>
                  <th className="py-2.5 px-3 text-right">{tr("Action")}</th>
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
                      {new Date(b.created_at).toLocaleString(locale())}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => api.download(`/v2/instances/${instance.id}/launcher/builds/${b.id}/download`).catch(error => toast.error(error.message))}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {tr("Télécharger")} </button>
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
