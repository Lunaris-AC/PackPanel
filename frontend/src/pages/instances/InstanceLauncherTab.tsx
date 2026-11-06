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
import { MinecraftInstance, LauncherBuild } from '../../types';
import { useToast } from '../../components/Toast';
import { useTranslation } from '../../i18n';
import { translateApiMessage } from '../../i18n/text';
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
  const [target, setTarget] = useState<'windows-installer' | 'windows' | 'linux' | 'macos' | 'all'>('windows-installer');
  const targetOs = target === 'windows-installer' ? 'windows' : target;
  const artifactFormat = target === 'windows-installer' ? 'installer' : 'zip';
  const [builds, setBuilds] = useState<LauncherBuild[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);

  // Launcher Config State
  const launcher = instance.launcher;
  const isEnabled = Boolean(instance.launcher_enabled && launcher);
  const readOnly = instance.permissions?.can_write === false;
  const canShare = !readOnly && instance.permissions?.can_publish === true;
  const playerPage = instance.player_page_url || `/play/${encodeURIComponent(instance.slug)}`;

  const [title, setTitle] = useState(launcher?.title || `${instance.name} Launcher`);
  const [template, setTemplate] = useState<'minimal' | 'community' | 'network'>(launcher?.template || 'community');
  const [accentColor, setAccentColor] = useState(launcher?.accent_color || '#6366f1');
  const [backgroundUrl, setBackgroundUrl] = useState(launcher?.background_url || '');
  const [logoUrl, setLogoUrl] = useState(launcher?.logo_url || '');
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
      setDiscordUrl(launcher.discord_url || '');
      setWebsiteUrl(launcher.website_url || '');
    }
  }, [launcher, instance.name]);

  const loadBuilds = async () => {
    try {
      const res = await api.get<{ builds: LauncherBuild[] }>(`/v2/instances/${instance.id}/launcher/builds`);
      setBuilds(res.builds || []);
      setHistoryError('');
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : tr("Erreur"));
    }
  };

  const hasActiveBuild = builds.some(build => build.status === 'pending' || build.status === 'building');
  const buildStages = {
    windows: text('Préparation de Windows', 'Preparing Windows'),
    linux: text('Préparation de Linux', 'Preparing Linux'),
    macos: text('Préparation de macOS', 'Preparing macOS'),
    archiving: text('Assemblage du ZIP', 'Assembling the ZIP'),
    installer: text('Création de l’installateur Windows', 'Creating the Windows installer'),
    verifying: text('Vérification du fichier', 'Verifying the download')
  };
  useEffect(() => {
    if (isEnabled) void loadBuilds();
  }, [instance.id, isEnabled]);
  useEffect(() => {
    if (!isEnabled || !hasActiveBuild) return;
    const timer = window.setInterval(loadBuilds, 2000);
    return () => window.clearInterval(timer);
  }, [instance.id, isEnabled, hasActiveBuild]);

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
        authMicrosoft: false,
        authOffline: true,
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
      const res = await api.post<{ success: boolean; build: LauncherBuild }>(
        `/v2/instances/${instance.id}/launcher/build`,
        { targetOs, artifactFormat, background: true }
      );
      setBuilds(current => [res.build, ...current.filter(build => build.id !== res.build.id)]);
      await loadBuilds();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de la génération du launcher"));
    } finally {
      setBuilding(false);
    }
  };

  const downloadBuild = async (id: string) => {
    setDownloading(id);
    try {
      await api.download(`/v2/instances/${instance.id}/launcher/builds/${id}/download`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Téléchargement impossible"));
    } finally {
      setDownloading(null);
    }
  };

  const updateSharing = async (build: LauncherBuild) => {
    setSharing(build.id);
    try {
      await api.put(`/v2/instances/${instance.id}/launcher/builds/${build.id}/share`, { shared: !build.shared_at });
      await loadBuilds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Erreur"));
    } finally {
      setSharing(null);
    }
  };

  const copyPlayerPage = async () => {
    const url = new URL(playerPage, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(text('Lien joueur copié.', 'Player link copied.'));
    } catch {
      window.prompt(text('Copiez le lien joueur.', 'Copy the player link.'), url);
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
          disabled={loading || readOnly}
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
            <p className="text-xs text-zinc-500">{text('Connexion avec un pseudo', 'Sign in with a nickname')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDisableLauncher}
            disabled={loading || readOnly}
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
                    disabled={uploadingLogo || readOnly}
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
                    disabled={uploadingBg || readOnly}
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

            {launcher?.auth_offline === false && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {text('Enregistrez les réglages pour activer la connexion avec un pseudo.', 'Save the settings to enable nickname sign-in.')}
              </p>
            )}

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
                disabled={loading || readOnly}
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
              {text('Le téléchargement inclut le launcher et les réglages enregistrés ci-contre. Les joueurs reçoivent les fichiers du pack lors du lancement, à partir de la dernière version publiée.', 'The download includes the launcher and the saved settings on this page. Players receive the latest published pack files when they launch the game.')}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {instance.active_release_id
                ? text('La génération continue en arrière-plan. Suivez son état dans l’historique ci-dessous.', 'The build runs in the background. Follow its status in the history below.')
                : text('Publiez la première version de l’instance pour pouvoir générer un launcher utilisable.', 'Publish the first release before building a playable launcher.')}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'windows-installer', label: text('Windows · Installateur (.exe)', 'Windows · Installer (.exe)') },
                { id: 'windows', label: 'Windows · Portable (.zip)' },
                { id: 'linux', label: 'Linux (.zip / .sh)' },
                { id: 'macos', label: 'macOS (.zip)' },
                { id: 'all', label: tr("Toutes les plateformes") }
              ] as const).map(os => (
                <button
                  key={os.id}
                  type="button"
                  aria-pressed={target === os.id}
                  onClick={() => setTarget(os.id)}
                  className={`p-2.5 rounded-lg border text-left text-xs transition ${
                    target === os.id
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
              disabled={building || readOnly || !instance.active_release_id || launcher?.auth_offline === false ||
                builds.some(build => build.target_os === targetOs && (build.artifact_format || 'zip') === artifactFormat && ['pending', 'building'].includes(build.status))}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {building ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>{text('Mise en file…', 'Queuing…')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{artifactFormat === 'installer' ? text('Générer l’installateur Windows', 'Build Windows installer') : <>{tr("Générer le launcher (")}{targetOs.toUpperCase()})</>}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Globe className="size-4 text-indigo-500" />
          {text('Page de téléchargement des joueurs', 'Player download page')}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {text('Partagez un fichier prêt depuis l’historique. Toute personne disposant du lien pourra le télécharger. Un nouveau partage remplace celui de la même plateforme.', 'Share a ready download from the history below. Anyone with the link can download it. A new share replaces the previous one for that platform.')}
        </p>
        {builds.some(build => build.shared_at) ? (
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
            <a href={playerPage} target="_blank" rel="noreferrer" className="inline-flex gap-1.5 items-center hover:underline">
              <ExternalLink className="size-3.5" /> {text('Ouvrir la page joueur', 'Open player page')}
            </a>
            <button type="button" onClick={copyPlayerPage} className="hover:underline">{text('Copier le lien', 'Copy link')}</button>
          </div>
        ) : <p className="text-xs text-zinc-500">{text('Aucune archive partagée.', 'No shared archive.')}</p>}
      </section>

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

        {historyError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{historyError}</p>}
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
                  <th className="py-2.5 px-3">{tr("Statut")}</th>
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
                        {b.target_os} · {b.artifact_format === 'installer' ? 'EXE' : 'ZIP'}
                      </span>
                    </td>
                    <td className="py-3 px-3" aria-live="polite">
                      {b.status === 'pending' && text('En file', 'Queued')}
                      {b.status === 'building' && (b.stage ? buildStages[b.stage] : text('En cours', 'Building'))}
                      {b.status === 'completed' && text('Prêt', 'Ready')}
                      {b.status === 'failed' && <span className="text-rose-600 dark:text-rose-300">{text('Échec', 'Failed')}{b.error_message && ` · ${translateApiMessage(b.error_message)}`}</span>}
                    </td>
                    <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                      {b.status === 'completed' ? formatBytes(b.artifact_size) : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px] text-zinc-400 truncate max-w-xs" title={b.artifact_sha256}>
                      {b.artifact_sha256 ? `${b.artifact_sha256.substring(0, 16)}...` : '—'}
                    </td>
                    <td className="py-3 px-3 text-zinc-500 text-[11px]">
                      {new Date(b.created_at).toLocaleString(locale())}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-2 justify-end">
                      {b.status === 'completed' && <button
                        type="button"
                        disabled={downloading !== null}
                        onClick={() => downloadBuild(b.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloading === b.id ? text('Téléchargement…', 'Downloading…') : tr("Télécharger")} </button>}
                        {b.status === 'completed' && b.instance_id && canShare && (
                          <button type="button" disabled={sharing !== null || (!instance.active_release_id && !b.shared_at)}
                            onClick={() => updateSharing(b)}
                            className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-2 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
                            {b.shared_at ? text('Retirer le partage', 'Unshare') : text('Partager', 'Share')}
                          </button>
                        )}
                        {b.status === 'completed' && !b.instance_id && canShare &&
                          <span className="text-zinc-500">{text('À régénérer pour partager', 'Rebuild to share')}</span>}
                      </div>
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
