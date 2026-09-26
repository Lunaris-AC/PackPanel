import React, { useEffect, useState } from 'react';
import {
  Users,
  Shield,
  UserPlus,
  Trash2,
  Key,
  FileSpreadsheet,
  Clock
} from 'lucide-react';
import { api } from '../api/client';
import { User, AuditLogItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator' | 'viewer'>('operator');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const res = await api.get<{ users: User[] }>('/users');
        setUsers(res.users);
      } else {
        const res = await api.get<{ total: number; logs: AuditLogItem[] }>('/audit-logs');
        setAuditLogs(res.logs);
      }
    } catch (e: any) {
      toast.error('Erreur chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;

    setSubmitting(true);
    try {
      await api.post('/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });
      toast.success(`Utilisateur "${newUsername}" créé avec succès`);
      setCreateModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur création utilisateur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.id === currentUser?.id) {
      toast.error('Vous ne pouvez pas supprimer votre propre compte');
      return;
    }
    if (!window.confirm(`Confirmez-vous la suppression de l'utilisateur "${u.username}" ?`)) {
      return;
    }

    try {
      await api.delete(`/users/${u.id}`);
      toast.success('Utilisateur supprimé');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur suppression utilisateur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Administration & Sécurité
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestion des utilisateurs, des accès RBAC et journal d'audit complet
          </p>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-brand-600/20 transition self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nouvel utilisateur
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-lg transition ${
            activeTab === 'users'
              ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Comptes utilisateurs ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg transition ${
            activeTab === 'audit'
              ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Journal d'audit
        </button>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : activeTab === 'users' ? (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-3 px-4">Utilisateur</th>
                <th className="py-3 px-4">Rôle</th>
                <th className="py-3 px-4">Dernière connexion</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-slate-400" />
                    <span>{u.username}</span>
                    {u.id === currentUser?.id && (
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-normal">
                        (vous)
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.role === 'admin'
                          ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                          : u.role === 'operator'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {u.role === 'admin' ? 'Administrateur' : u.role === 'operator' ? 'Opérateur' : 'Lecteur'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-slate-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : 'Jamais'}
                  </td>

                  <td className="py-3 px-4 text-right">
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        title="Supprimer cet utilisateur"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Utilisateur</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Cible</th>
                <th className="py-3 px-4">Détails</th>
                <th className="py-3 px-4">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                    {new Date(log.created_at).toLocaleString('fr-FR')}
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    {log.user_name || 'Système'}
                  </td>

                  <td className="py-3 px-4 font-mono font-bold text-xs text-brand-600 dark:text-brand-400">
                    {log.action}
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 8)}...)` : ''}
                  </td>

                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px] max-w-xs truncate" title={JSON.stringify(log.details)}>
                    {JSON.stringify(log.details)}
                  </td>

                  <td className="py-3 px-4 text-slate-400 text-xs font-mono">
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Créer un compte utilisateur"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Nom d'utilisateur
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Rôle
            </label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="operator">Opérateur (téléversement, publication, édition)</option>
              <option value="admin">Administrateur (contrôle total & gestion des utilisateurs)</option>
              <option value="viewer">Lecteur (lecture seule des manifestes et versions)</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-lg shadow disabled:opacity-60"
            >
              {submitting ? 'Création...' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
