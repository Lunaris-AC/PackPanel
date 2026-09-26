import React, { useState, useEffect } from 'react';
import {
  Box,
  Plus,
  Server,
  Layers,
  FileCode,
  FolderOpen,
  Trash2,
  Edit2,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  Search,
  Sparkles
} from 'lucide-react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

interface MinecraftInstance {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon_url?: string;
  minecraft_version: string;
  loader_type: 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt';
  loader_version?: string;
  java_version: number;
  java_args?: string;
  server_address?: string;
  server_name?: string;
  file_policies?: any;
  endpoint_id?: string;
  endpoint_slug?: string;
  active_release_id?: string;
  active_total_files?: number;
  active_total_bytes?: number;
  manifest_url?: string;
  legacy_url?: string;
  created_at: string;
}

interface InstancesPageProps {
  onNavigate: (tab: string) => void;
}

export const InstancesPage: React.FC<InstancesPageProps> = ({ onNavigate }) => {
  const { toast } = useToast();
  const [instances, setInstances] = useState<MinecraftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<MinecraftInstance | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    minecraftVersion: '1.20.1',
    loaderType: 'fabric',
    loaderVersion: '',
    javaVersion: 17,
    javaArgs: '-Xms2G -Xmx4G',
    serverAddress: '',
    serverName: ''
  });

  const loadInstances = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/v2/instances');
      setInstances(res.instances || []);
    } catch (err: any) {
      toast.error('Erreur lors du chargement des instances: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const openCreateModal = () => {
    setEditingInstance(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      minecraftVersion: '1.20.1',
      loaderType: 'fabric',
      loaderVersion: '',
      javaVersion: 17,
      javaArgs: '-Xms2G -Xmx4G',
      serverAddress: '',
      serverName: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (inst: MinecraftInstance) => {
    setEditingInstance(inst);
    setFormData({
      name: inst.name,
      slug: inst.slug,
      description: inst.description || '',
      minecraftVersion: inst.minecraft_version,
      loaderType: inst.loader_type,
      loaderVersion: inst.loader_version || '',
      javaVersion: inst.java_version,
      javaArgs: inst.java_args || '-Xms2G -Xmx4G',
      serverAddress: inst.server_address || '',
      serverName: inst.server_name || ''
    });
    setModalOpen(true);
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
      slug: editingInstance ? prev.slug : slug
    }));
  };

  const handleMcVersionChange = (version: string) => {
    let recJava = 17;
    const parts = version.split('.').map(Number);
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    if (minor <= 16) recJava = 8;
    else if (minor < 20 || (minor === 20 && patch <= 4)) recJava = 17;
    else recJava = 21;

    setFormData(prev => ({
      ...prev,
      minecraftVersion: version,
      javaVersion: recJava
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingInstance) {
        await api.put(`/api/v2/instances/${editingInstance.id}`, formData);
        toast.success('Instance mise à jour avec succès');
      } else {
        await api.post('/api/v2/instances', formData);
        toast.success('Instance Minecraft créée avec succès');
      }
      setModalOpen(false);
      loadInstances();
    } catch (err: any) {
      toast.error(err.message || 'Une erreur est survenue');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer définitivement l'instance "${name}" ?`)) return;
    try {
      await api.delete(`/api/v2/instances/${id}`);
      toast.success('Instance supprimée');
      loadInstances();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    toast.success('URL copiée dans le presse-papiers');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const filteredInstances = instances.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.slug.toLowerCase().includes(search.toLowerCase()) ||
    i.minecraft_version.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Box className="w-5 h-5 text-indigo-500" />
            Instances Minecraft
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Gérez vos versions Vanilla, Forge, NeoForge, Fabric et Quilt avec leurs règles de synchronisation et Java.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Instance
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une instance..."
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Instance Cards */}
      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl p-10 text-center">
          <Box className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Aucune instance configurée</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            Créez votre première instance pour distribuer vos modpacks avec notre moteur indépendant.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition"
          >
            <Plus className="w-4 h-4" />
            Créer une instance
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInstances.map(inst => (
            <div
              key={inst.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {inst.name}
                    </h3>
                    <p className="text-[11px] font-mono text-zinc-400 truncate">
                      {inst.slug}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-semibold shrink-0 ${
                    inst.loader_type === 'fabric'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      : inst.loader_type === 'forge'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                      : inst.loader_type === 'neoforge'
                      ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
                      : inst.loader_type === 'quilt'
                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}>
                    {inst.loader_type}
                  </span>
                </div>

                {inst.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2">
                    {inst.description}
                  </p>
                )}

                {/* Specs */}
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">MINECRAFT</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{inst.minecraft_version}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">JAVA REQUIS</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">Java {inst.java_version}</span>
                  </div>
                  {inst.server_address && (
                    <div className="col-span-2 mt-1">
                      <span className="text-[10px] text-zinc-400 block font-medium">SERVEUR DIRECT</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400 text-[11px] truncate block">
                        {inst.server_address}
                      </span>
                    </div>
                  )}
                </div>

                {/* Manifest URLs */}
                <div className="mt-4 space-y-1.5 bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-zinc-500 truncate">V2 Manifest</span>
                    {inst.manifest_url && (
                      <button
                        onClick={() => copyToClipboard(inst.manifest_url!, `v2-${inst.id}`)}
                        className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition ml-2"
                        title="Copier l'URL V2"
                      >
                        {copiedUrl === `v2-${inst.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  onClick={() => onNavigate(`endpoint:${inst.endpoint_id || inst.id}`)}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Gérer les fichiers
                </button>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => openEditModal(inst)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Modifier l'instance"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(inst.id, inst.name)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title="Supprimer l'instance"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Création / Edition */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingInstance ? 'Modifier l\'instance' : 'Créer une nouvelle instance Minecraft'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Nom de l'instance
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ex: Survie Inferi 1.20"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Slug d'accès (URL)
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editingInstance)}
              value={formData.slug}
              onChange={e => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Version Minecraft
              </label>
              <select
                value={formData.minecraftVersion}
                onChange={e => handleMcVersionChange(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              >
                <option value="1.21.1">1.21.1 (Dernière version)</option>
                <option value="1.21">1.21</option>
                <option value="1.20.4">1.20.4</option>
                <option value="1.20.1">1.20.1 (Très populaire)</option>
                <option value="1.19.4">1.19.4</option>
                <option value="1.18.2">1.18.2</option>
                <option value="1.16.5">1.16.5 (Standard moddé)</option>
                <option value="1.12.2">1.12.2 (Legacy Forge)</option>
                <option value="1.7.10">1.7.10</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Mod Loader
              </label>
              <select
                value={formData.loaderType}
                onChange={e => setFormData({ ...formData, loaderType: e.target.value as any })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              >
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="neoforge">NeoForge</option>
                <option value="quilt">Quilt</option>
                <option value="vanilla">Vanilla (Sans loader)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Version Java requise
              </label>
              <select
                value={formData.javaVersion}
                onChange={e => setFormData({ ...formData, javaVersion: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              >
                <option value={8}>Java 8 (1.16.5 et antérieur)</option>
                <option value={17}>Java 17 (1.17 à 1.20.4)</option>
                <option value={21}>Java 21 (1.20.5 et supérieur)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Arguments JVM
              </label>
              <input
                type="text"
                value={formData.javaArgs}
                onChange={e => setFormData({ ...formData, javaArgs: e.target.value })}
                placeholder="-Xms2G -Xmx4G"
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Connexion directe serveur (Optionnel)
            </label>
            <input
              type="text"
              value={formData.serverAddress}
              onChange={e => setFormData({ ...formData, serverAddress: e.target.value })}
              placeholder="play.monserveur.fr:25565"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
            >
              {editingInstance ? 'Enregistrer' : 'Créer l\'instance'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
