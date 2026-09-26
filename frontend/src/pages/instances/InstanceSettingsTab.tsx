import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Save,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  Cpu,
  Layers,
  Search
} from 'lucide-react';
import { api } from '../../api/client';
import { catalogApi } from '../../api/catalog';
import { MinecraftInstance, LoaderType, MinecraftVersionSummary, LoaderCompatibilitySummary, LoaderVersionEntry } from '../../types';
import { useToast } from '../../components/Toast';

interface InstanceSettingsTabProps {
  instance: MinecraftInstance;
  onRefresh: () => void;
}

export const InstanceSettingsTab: React.FC<InstanceSettingsTabProps> = ({ instance, onRefresh }) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form Fields
  const [name, setName] = useState(instance.name);
  const [description, setDescription] = useState(instance.description || '');
  const [minecraftVersion, setMinecraftVersion] = useState(instance.minecraft_version);
  const [loaderType, setLoaderType] = useState<LoaderType>(instance.loader_type);
  const [loaderVersion, setLoaderVersion] = useState<string>(instance.loader_version || '');
  const [javaVersion, setJavaVersion] = useState<number>(instance.java_version);
  const [javaArgs, setJavaArgs] = useState<string>(instance.java_args || '-Xms2G -Xmx4G');
  const [serverAddress, setServerAddress] = useState(instance.server_address || '');

  // Catalog State
  const [mcVersions, setMcVersions] = useState<MinecraftVersionSummary[]>([]);
  const [availableLoaders, setAvailableLoaders] = useState<LoaderCompatibilitySummary[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Load MC versions on mount
  useEffect(() => {
    async function loadMc() {
      try {
        const res = await catalogApi.getMinecraftVersions();
        setMcVersions(res.versions || []);
      } catch (e) {
        console.error('Failed to load MC versions', e);
      }
    }
    loadMc();
  }, []);

  // When MC Version changes: fetch compatible loaders
  useEffect(() => {
    if (!minecraftVersion) return;
    let active = true;

    async function loadLoaders() {
      try {
        const res = await catalogApi.getCompatibleLoaders(minecraftVersion);
        if (!active) return;
        setAvailableLoaders(res.loaders || []);
      } catch (e) {
        console.error('Failed to load compatible loaders', e);
      }
    }
    loadLoaders();
    return () => { active = false; };
  }, [minecraftVersion]);

  // When Loader or MC changes: fetch loader versions & requirements
  useEffect(() => {
    if (!minecraftVersion || !loaderType) return;
    let active = true;

    async function loadDetails() {
      try {
        if (loaderType !== 'vanilla') {
          setLoadingCatalog(true);
          const res = await catalogApi.getLoaderVersions(loaderType, minecraftVersion);
          if (!active) return;
          setLoaderVersions(res.versions || []);
        } else {
          setLoaderVersions([]);
        }
      } catch (e) {
        console.error('Failed to load loader versions', e);
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }
    loadDetails();
    return () => { active = false; };
  }, [minecraftVersion, loaderType]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Validate with catalog
      const validation = await catalogApi.validateCombination(minecraftVersion, loaderType, loaderVersion || undefined);
      if (!validation.valid) {
        toast.error(validation.error || 'Combinaison Minecraft / loader invalide');
        setSaving(false);
        return;
      }

      await api.put(`/v2/instances/${instance.id}`, {
        name,
        description,
        minecraftVersion,
        loaderType,
        loaderVersion: loaderType === 'vanilla' ? null : (loaderVersion || null),
        javaVersion,
        javaArgs,
        serverAddress: serverAddress.trim() || null
      });

      toast.success('Paramètres enregistrés en brouillon. N’oubliez pas de publier pour déployer aux joueurs !');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmation = window.prompt(
      `Pour confirmer la suppression définitive de "${instance.name}", saisissez son slug (${instance.slug}) :`
    );
    if (confirmation !== instance.slug) {
      if (confirmation !== null) toast.error('Le slug saisi ne correspond pas. Suppression annulée.');
      return;
    }

    try {
      setDeleting(true);
      await api.delete(`/v2/instances/${instance.id}`);
      toast.success('Instance supprimée');
      navigate('/instances');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Notice Card */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-800 dark:text-amber-200">
        <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <span className="font-bold block">Principe des versions immuables</span>
          <span>
            Les modifications apportées ci-dessous restent en <strong>brouillon</strong>. La version active distribuée à vos joueurs ne sera mise à jour que lorsque vous déclencherez une <strong>publication</strong> dans l'onglet dédié.
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-500" />
            Configuration générale & Moteur de jeu
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ajustez la version du jeu, le loader, les arguments mémoire et l'adresse du serveur.
          </p>
        </div>

        {/* Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Nom de l'instance
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Slug d'accès (Fixe)
            </label>
            <input
              type="text"
              disabled
              value={instance.slug}
              className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>
        </div>

        {/* Minecraft & Loader */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Version Minecraft
            </label>
            <select
              value={minecraftVersion}
              onChange={e => setMinecraftVersion(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            >
              {mcVersions.length > 0 ? (
                mcVersions.slice(0, 40).map(v => (
                  <option key={v.id} value={v.id}>
                    {v.id} {v.type === 'snapshot' ? '(Snapshot)' : ''}
                  </option>
                ))
              ) : (
                <option value={instance.minecraft_version}>{instance.minecraft_version}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Mod Loader
            </label>
            <select
              value={loaderType}
              onChange={e => setLoaderType(e.target.value as LoaderType)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 capitalize"
            >
              <option value="fabric">Fabric</option>
              <option value="neoforge">NeoForge</option>
              <option value="forge">Forge</option>
              <option value="quilt">Quilt</option>
              <option value="vanilla">Vanilla</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Version du Loader
            </label>
            {loaderType === 'vanilla' ? (
              <input
                type="text"
                disabled
                value="Aucun (Vanilla)"
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400"
              />
            ) : (
              <select
                value={loaderVersion}
                onChange={e => setLoaderVersion(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              >
                {loaderVersions.map((lv, idx) => (
                  <option key={lv.version} value={lv.version}>
                    {lv.version} {idx === 0 ? '(Recommandée)' : ''}
                  </option>
                ))}
                {loaderVersion && !loaderVersions.some(lv => lv.version === loaderVersion) && (
                  <option value={loaderVersion}>{loaderVersion} (Actuelle)</option>
                )}
              </select>
            )}
          </div>
        </div>

        {/* Java & Server */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Version Java requise
            </label>
            <select
              value={javaVersion}
              onChange={e => setJavaVersion(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            >
              <option value={8}>Java 8 (&lt;= 1.16.5)</option>
              <option value={16}>Java 16 (1.17)</option>
              <option value={17}>Java 17 (1.18 à 1.20.4)</option>
              <option value={21}>Java 21 (1.20.5+ et NeoForge)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Arguments JVM
            </label>
            <input
              type="text"
              value={javaArgs}
              onChange={e => setJavaArgs(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Connexion directe serveur
            </label>
            <input
              type="text"
              value={serverAddress}
              onChange={e => setServerAddress(e.target.value)}
              placeholder="play.monserveur.fr:25565"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-semibold text-xs rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          Zone de danger : Supprimer cette instance
        </h3>
        <p className="text-xs text-rose-700/80 dark:text-rose-300/70">
          La suppression de l'instance supprime son espace de distribution, son launcher associé et toutes ses versions publiées. Cette action est irréversible.
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl transition shadow-xs flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Suppression...' : 'Supprimer définitivement cette instance'}
          </button>
        </div>
      </div>
    </div>
  );
};
