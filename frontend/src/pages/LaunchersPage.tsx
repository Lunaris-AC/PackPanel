import { useTranslation } from '../i18n';
import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Plus,
  Palette,
  Sparkles,
  Download,
  Trash2,
  Edit2,
  ExternalLink,
  Shield,
  Layers,
  Check,
  Globe,
  MessageSquare
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

interface LauncherProject {
  id: string;
  name: string;
  slug: string;
  title: string;
  template: 'minimal' | 'community' | 'network';
  accent_color: string;
  background_url?: string;
  logo_url?: string;
  icon_url?: string;
  auth_microsoft: boolean;
  auth_offline: boolean;
  discord_url?: string;
  website_url?: string;
  instance_count?: number;
  created_at: string;
}

interface MinecraftInstance {
  id: string;
  name: string;
  slug: string;
  minecraft_version: string;
  loader_type: string;
}

interface LaunchersPageProps {
  onNavigate: (tab: string) => void;
}

export const LaunchersPage: React.FC<LaunchersPageProps> = () => {
  const { tr } = useTranslation();
  const { toast } = useToast();
  const [launchers, setLaunchers] = useState<LauncherProject[]>([]);
  const [availableInstances, setAvailableInstances] = useState<MinecraftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLauncher, setEditingLauncher] = useState<LauncherProject | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    title: '',
    template: 'minimal' as 'minimal' | 'community' | 'network',
    accentColor: '#6366f1',
    backgroundUrl: '',
    logoUrl: '',
    authMicrosoft: false,
    authOffline: true,
    discordUrl: '',
    websiteUrl: '',
    instanceIds: [] as string[]
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [launchersRes, instancesRes] = await Promise.all([
        api.get('/v2/launchers'),
        api.get('/v2/instances')
      ]);
      setLaunchers(launchersRes.launchers || []);
      setAvailableInstances(instancesRes.instances || []);
    } catch (err: any) {
      toast.error(tr("Erreur lors du chargement: ") + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingLauncher(null);
    setFormData({
      name: '',
      slug: '',
      title: tr("Mon Launcher"),
      template: 'community',
      accentColor: '#6366f1',
      backgroundUrl: '',
      logoUrl: '',
      authMicrosoft: false,
      authOffline: true,
      discordUrl: '',
      websiteUrl: '',
      instanceIds: availableInstances.map(i => i.id)
    });
    setModalOpen(true);
  };

  const openEditModal = async (launcher: LauncherProject) => {
    setEditingLauncher(launcher);
    try {
      const details = await api.get(`/v2/launchers/${launcher.id}`);
      const selectedInstanceIds = (details.instances || []).map((i: any) => i.id);
      setFormData({
        name: launcher.name,
        slug: launcher.slug,
        title: launcher.title,
        template: launcher.template,
        accentColor: launcher.accent_color || '#6366f1',
        backgroundUrl: launcher.background_url || '',
        logoUrl: launcher.logo_url || '',
        authMicrosoft: launcher.auth_microsoft,
        authOffline: launcher.auth_offline,
        discordUrl: launcher.discord_url || '',
        websiteUrl: launcher.website_url || '',
        instanceIds: selectedInstanceIds
      });
      setModalOpen(true);
    } catch (err: any) {
      toast.error(tr("Erreur lors du chargement des détails: ") + err.message);
    }
  };

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    setFormData(prev => ({
      ...prev,
      name,
      slug: editingLauncher ? prev.slug : slug,
      title: prev.title === tr("Mon Launcher") || !prev.title ? `${name} Launcher` : prev.title
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLauncher) {
        await api.put(`/v2/launchers/${editingLauncher.id}`, formData);
        toast.success(tr("Projet de launcher mis à jour"));
      } else {
        await api.post('/v2/launchers', formData);
        toast.success(tr("Launcher personnalisé créé avec succès"));
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || tr("Une erreur est survenue"));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(tr("Supprimer le launcher \"{0}\" ?", { 0: name }))) return;
    try {
      await api.delete(`/v2/launchers/${id}`);
      toast.success(tr("Launcher supprimé"));
      loadData();
    } catch (err: any) {
      toast.error(err.message || tr("Erreur lors de la suppression"));
    }
  };

  const downloadClientConfig = async (launcher: LauncherProject) => {
    try {
      const config = await api.get(`/v2/launchers/${launcher.id}/config`);
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `launcher-config-${launcher.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tr("Configuration client téléchargée !"));
    } catch (err: any) {
      toast.error(tr("Erreur de téléchargement: ") + err.message);
    }
  };

  const toggleInstanceSelection = (id: string) => {
    setFormData(prev => ({
      ...prev,
      instanceIds: prev.instanceIds.includes(id)
        ? prev.instanceIds.filter(x => x !== id)
        : [...prev.instanceIds, id]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-indigo-500" />
            {tr("Launchers Personnalisés")} </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {tr("Créez et personnalisez des launchers de bureau complets (Minimal, Community, Network) sans écrire de code.")} </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          {tr("Nouveau Launcher")} </button>
      </div>

      {/* Grid of Launcher Projects */}
      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : launchers.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl p-10 text-center">
          <Monitor className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{tr("Aucun launcher configuré")}</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            {tr("Créez votre launcher personnalisé avec vos couleurs, logo, instances et modèle visuel.")} </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition"
          >
            <Plus className="w-4 h-4" />
            {tr("Créer un launcher")} </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {launchers.map(proj => (
            <div
              key={proj.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between"
            >
              {/* Card Banner Header */}
              <div
                className="h-20 p-4 flex items-start justify-between relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${proj.accent_color}22 0%, ${proj.accent_color}66 100%)`,
                  borderBottom: `2px solid ${proj.accent_color}`
                }}
              >
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {proj.title}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300">
                    {proj.slug}
                  </p>
                </div>

                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-semibold bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs text-zinc-800 dark:text-zinc-200 border border-zinc-200/50 dark:border-zinc-800/50">
                  {proj.template}
                </span>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3 flex-1 text-xs">
                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                  <span>{tr("Instances incluses :")}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {proj.instance_count || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                  <span>{tr("Authentification :")}</span>
                  <div className="flex items-center space-x-1.5 font-mono text-[10px]">
                    {proj.auth_microsoft && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Microsoft
                      </span>
                    )}
                    {proj.auth_offline && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {tr("Offline")} </span>
                    )}
                  </div>
                </div>

                {/* Social links */}
                <div className="flex items-center space-x-3 pt-1 text-zinc-400">
                  {proj.discord_url && (
                    <span className="flex items-center gap-1 text-[11px] text-indigo-500">
                      <MessageSquare className="w-3.5 h-3.5" /> Discord
                    </span>
                  )}
                  {proj.website_url && (
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <Globe className="w-3.5 h-3.5" />  {tr("Site Web")} </span>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                <button
                  onClick={() => downloadClientConfig(proj)}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  {tr("Exporter config")} </button>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => openEditModal(proj)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title={tr("Personnaliser")}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(proj.id, proj.name)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title={tr("Supprimer")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Personnalisation Launcher */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLauncher ? tr("Personnaliser le Launcher") : tr("Créer un nouveau Launcher")}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              {tr("Nom du projet")} </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder={tr("Ex: Inferi Community Launcher")}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                {tr("Titre affiché dans le launcher")} </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                {tr("Couleur d'accent")} </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.accentColor}
                  onChange={e => setFormData({ ...formData, accentColor: e.target.value })}
                  className="h-8 w-10 border-0 p-0 rounded cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={formData.accentColor}
                  onChange={e => setFormData({ ...formData, accentColor: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              {tr("Modèle visuel (Template)")} </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'minimal', title: 'Minimal', desc: tr("1 bouton jouer, ultra-léger") },
                { id: 'community', title: 'Community', desc: tr("Actualités & Discord") },
                { id: 'network', title: 'Network', desc: tr("Multi-serveurs & console") }
              ].map(tpl => (
                <div
                  key={tpl.id}
                  onClick={() => setFormData({ ...formData, template: tpl.id as any })}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                    formData.template === tpl.id
                      ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{tpl.title}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{tpl.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Instances Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              {tr("Instances Minecraft incluses")} </label>
            {availableInstances.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">{tr("Aucune instance disponible. Veuillez créer une instance d'abord.")}</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 bg-zinc-50/50 dark:bg-zinc-950/50">
                {availableInstances.map(inst => (
                  <label key={inst.id} className="flex items-center space-x-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.instanceIds.includes(inst.id)}
                      onChange={() => toggleInstanceSelection(inst.id)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-zinc-800 dark:text-zinc-200">{inst.name}</span>
                    <span className="text-[10px] font-mono text-zinc-400">({inst.minecraft_version} - {inst.loader_type})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Auth Toggles */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {tr("Modes de connexion autorisés")} </span>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.authMicrosoft}
                  onChange={e => setFormData({ ...formData, authMicrosoft: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <span className="text-zinc-800 dark:text-zinc-200">{tr("Compte Microsoft")}</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.authOffline}
                  onChange={e => setFormData({ ...formData, authOffline: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <span className="text-zinc-800 dark:text-zinc-200">{tr("Mode Offline (Pseudonyme)")}</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            >
              {tr("Annuler")} </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
            >
              {editingLauncher ? tr("Enregistrer") : tr("Créer le launcher")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
