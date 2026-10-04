import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  ArrowLeft,
  Check,
  Cpu,
  Layers,
  Server,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Search,
  CheckCircle2
} from 'lucide-react';
import { api } from '../../api/client';
import { catalogApi } from '../../api/catalog';
import { useToast } from '../../components/Toast';
import { LoaderType, MinecraftVersionSummary, LoaderCompatibilitySummary, LoaderVersionEntry } from '../../types';

export const NewInstanceWizard: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [mcVersions, setMcVersions] = useState<MinecraftVersionSummary[]>([]);
  const [versionFilter, setVersionFilter] = useState<'releases' | 'all'>('releases');
  const [mcSearch, setMcSearch] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [minecraftVersion, setMinecraftVersion] = useState('1.21.1');
  const [loaderType, setLoaderType] = useState<LoaderType>('fabric');
  const [loaderVersion, setLoaderVersion] = useState<string>('');
  const [javaVersion, setJavaVersion] = useState<number>(21);
  const [javaArgs, setJavaArgs] = useState<string>('-Xms2G -Xmx4G');
  const [serverAddress, setServerAddress] = useState('');

  // Dynamic compatibility state
  const [availableLoaders, setAvailableLoaders] = useState<LoaderCompatibilitySummary[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionEntry[]>([]);
  const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
  const [loadingCompatibility, setLoadingCompatibility] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Initial Load: Fetch Minecraft Versions from official catalog
  useEffect(() => {
    async function initCatalog() {
      try {
        setLoadingCatalog(true);
        const res = await catalogApi.getMinecraftVersions();
        setMcVersions(res.versions || []);
        if (res.latestRelease) {
          setMinecraftVersion(res.latestRelease);
        }
      } catch (err: any) {
        toast.error('Impossible de charger le catalogue Minecraft: ' + (err.message || ''));
      } finally {
        setLoadingCatalog(false);
      }
    }
    initCatalog();
  }, []);

  // 2. When Minecraft Version changes: fetch compatible loaders
  useEffect(() => {
    if (!minecraftVersion) return;

    let active = true;
    setLoadingCompatibility(true);
    setAvailableLoaders([]);
    setCatalogError('');
    async function updateLoaders() {
      try {
        const res = await catalogApi.getCompatibleLoaders(minecraftVersion);
        if (!active) return;
        setAvailableLoaders(res.loaders || []);

        // If current loaderType is not supported, fallback to first supported or vanilla
        setLoaderType(current => res.loaders.some(l => l.loader === current && l.available)
          ? current : (res.loaders.find(l => l.loader !== 'vanilla' && l.available)?.loader || 'vanilla'));
      } catch (err: any) {
        if (active) setCatalogError(err.message || 'Impossible de vérifier la compatibilité des loaders.');
      } finally {
        if (active) setLoadingCompatibility(false);
      }
    }

    updateLoaders();
    return () => { active = false; };
  }, [minecraftVersion]);

  // 3. When Loader or MC Version changes: fetch loader versions & Java requirements
  useEffect(() => {
    if (!minecraftVersion || !loaderType) return;

    let active = true;
    setLoadingLoaderVersions(true);
    setLoaderVersions([]);
    setLoaderVersion('');
    async function updateLoaderDetails() {
      try {
        // Fetch Java requirements
        const reqRes = await catalogApi.getRequirements(minecraftVersion, loaderType);
        if (!active) return;
        if (reqRes.requirements) {
          setJavaVersion(reqRes.requirements.majorVersion);
          if (reqRes.requirements.jvmArgs.length > 0) {
            setJavaArgs(reqRes.requirements.jvmArgs.join(' '));
          }
        }

        // Fetch loader versions if not vanilla
        if (loaderType === 'vanilla') {
          setLoaderVersions([]);
          setLoaderVersion('');
          return;
        }

        setLoadingLoaderVersions(true);
        const lRes = await catalogApi.getLoaderVersions(loaderType, minecraftVersion);
        if (!active) return;
        setLoaderVersions(lRes.versions || []);

        if (lRes.versions && lRes.versions.length > 0) {
          setLoaderVersion((lRes.versions.find(v => v.isRecommended) || lRes.versions[0]).version);
        } else {
          setLoaderVersion('');
        }
      } catch (err: any) {
        if (active) setCatalogError(err.message || 'Impossible de charger les versions du loader.');
      } finally {
        if (active) setLoadingLoaderVersions(false);
      }
    }

    updateLoaderDetails();
    return () => { active = false; };
  }, [minecraftVersion, loaderType]);

  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error('Veuillez renseigner un nom et un identifiant pour l’instance.');
      return;
    }

    setSubmitting(true);
    try {
      // Validate with catalog
      const validation = await catalogApi.validateCombination(minecraftVersion, loaderType, loaderVersion);
      if (!validation.valid) {
        toast.error(validation.error || 'Combinaison Minecraft / loader invalide');
        setSubmitting(false);
        return;
      }

      const res = await api.post('/v2/instances', {
        name,
        slug,
        description,
        minecraftVersion,
        loaderType,
        loaderVersion: loaderType === 'vanilla' ? undefined : (loaderVersion || undefined),
        javaVersion,
        javaArgs,
        serverAddress: serverAddress.trim() || undefined
      });

      toast.success(`Instance "${res.instance.name}" créée avec succès !`);
      navigate(`/instances/${res.instance.id}/overview`);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la création de l’instance');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredVersions = mcVersions.filter(v => {
    if (versionFilter === 'releases' && v.type !== 'release') return false;
    if (mcSearch) {
      return v.id.toLowerCase().includes(mcSearch.toLowerCase());
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/instances')}
          className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Retour aux instances
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-5 mb-6">
          <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 mb-1">
            <Sparkles className="w-5 h-5" />
            <span className="text-xs font-bold tracking-wide uppercase">Assistant de création</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Nouvelle Instance Minecraft
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Configurez votre environnement de jeu, votre loader et vos règles en quelques clics. Vous pourrez ensuite y déposer vos mods et générer votre launcher.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Identité */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs flex items-center justify-center font-bold">1</span>
              Identité de l'instance
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Nom du serveur ou du modpack <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Ex: Survie Inferi 1.21"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Identifiant unique (Slug d'accès) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="survie-inferi-1-21"
                  className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Description (Optionnelle)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Pack officiel pour les membres de la communauté..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>

          {/* Step 2: Version Minecraft (Officielle & Dynamique) */}
          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs flex items-center justify-center font-bold">2</span>
                Version Minecraft
              </h2>

              <div className="flex items-center space-x-2">
                <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setVersionFilter('releases')}
                    className={`px-2 py-0.5 rounded transition font-medium ${
                      versionFilter === 'releases'
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Releases officielles
                  </button>
                  <button
                    type="button"
                    onClick={() => setVersionFilter('all')}
                    className={`px-2 py-0.5 rounded transition font-medium ${
                      versionFilter === 'all'
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Toutes (Snapshots)
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                  <input
                    type="text"
                    value={mcSearch}
                    onChange={e => setMcSearch(e.target.value)}
                    placeholder="Filtrer les versions Minecraft (ex: 1.21.1, 1.20, 1.16)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/40">
                  {loadingCatalog ? (
                    <div className="p-3 text-xs text-zinc-400">Chargement des versions officielles Mojang...</div>
                  ) : filteredVersions.length === 0 ? (
                    <div className="p-3 text-xs text-zinc-400">Aucune version trouvée</div>
                  ) : (
                    filteredVersions.slice(0, 30).map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setMinecraftVersion(v.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono transition ${
                          minecraftVersion === v.id
                            ? 'bg-indigo-600 text-white font-bold shadow-xs'
                            : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                        }`}
                      >
                        {v.id}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Version sélectionnée</span>
                  <p className="text-xl font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                    {minecraftVersion}
                  </p>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                  Métadonnées officielles Mojang validées automatiquement.
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Mod Loader */}
          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs flex items-center justify-center font-bold">3</span>
              Moteur & Mod Loader
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { id: 'fabric', label: 'Fabric', desc: 'Léger & moderne' },
                { id: 'neoforge', label: 'NeoForge', desc: 'Standard 1.20.4+' },
                { id: 'forge', label: 'Forge', desc: 'Historique moddé' },
                { id: 'quilt', label: 'Quilt', desc: 'Écosystème modulaire' },
                { id: 'vanilla', label: 'Vanilla', desc: 'Sans loader' }
              ].map(loader => {
                const compat = availableLoaders.find(l => l.loader === loader.id);
                const isSupported = !loadingCompatibility && Boolean(compat?.available);
                const isSelected = loaderType === loader.id;

                return (
                  <button
                    key={loader.id}
                    type="button"
                    disabled={!isSupported}
                    onClick={() => setLoaderType(loader.id as LoaderType)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between relative ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                        : isSupported
                        ? 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                        : 'border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-100/50 dark:bg-zinc-900/30 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs capitalize text-zinc-900 dark:text-zinc-100">
                          {loader.label}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{loader.desc}</p>
                    </div>

                    {!isSupported && (
                      <span className="text-[9px] text-rose-500 font-medium mt-1">{loadingCompatibility ? 'Vérification…' : compat?.error ? 'Catalogue indisponible' : `Non supporté pour ${minecraftVersion}`}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {catalogError && <p role="alert" className="text-xs text-rose-500">{catalogError}</p>}
            {/* Loader Version Selector (if not vanilla) */}
            {loaderType !== 'vanilla' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Version de {loaderType.toUpperCase()}
                </label>
                {loadingLoaderVersions ? (
                  <div className="text-xs text-zinc-400 flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-500"></div>
                    <span>Résolution des versions compatibles en amont...</span>
                  </div>
                ) : loaderVersions.length === 0 ? (
                  <p className="text-xs text-amber-600">Aucune version disponible trouvée pour cette combinaison.</p>
                ) : (
                  <select
                    value={loaderVersion}
                    onChange={e => setLoaderVersion(e.target.value)}
                    className="w-full sm:w-1/2 px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    {loaderVersions.map((lv, idx) => (
                      <option key={lv.version} value={lv.version}>
                        {lv.version} {lv.isRecommended ? '(Recommandée)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Step 4: Java & Direct Server Settings */}
          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs flex items-center justify-center font-bold">4</span>
              Environnement Java & Connexion directe
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Version Java (Déterminée automatiquement)
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={javaVersion}
                    onChange={e => setJavaVersion(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                  >
                    <option value={8}>Java 8 (Legacy &lt;= 1.16.5)</option>
                    <option value={16}>Java 16 (1.17)</option>
                    <option value={17}>Java 17 (1.18 à 1.20.4)</option>
                    <option value={21}>Java 21 (1.20.5+ et NeoForge)</option>
                    <option value={25}>Java 25 (26.1+)</option>
                  </select>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">Conforme aux spécifications officielles Mojang / Loader.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Arguments JVM par défaut
                </label>
                <input
                  type="text"
                  value={javaArgs}
                  onChange={e => setJavaArgs(e.target.value)}
                  placeholder="-Xms2G -Xmx4G"
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Adresse de connexion directe (Optionnel)
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
          </div>

          {/* Submission Buttons */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => navigate('/instances')}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || loadingCatalog || loadingCompatibility || loadingLoaderVersions || !!catalogError || (loaderType !== 'vanilla' && !loaderVersion)}
              className="px-5 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg shadow-xs transition flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white dark:border-zinc-900"></div>
                  <span>Validation & Création...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Créer l'instance</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
