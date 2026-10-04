import { locale } from '../i18n/format';
import React, { useEffect, useState } from 'react';
import {
  Users,
  Shield,
  ShieldCheck,
  UserPlus,
  Trash2,
  Edit2,
  Key,
  Clock
} from 'lucide-react';
import { api } from '../api/client';
import { User, AuditLogItem, UserEndpointPermission } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useTranslation } from '../i18n';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { tr, t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator' | 'viewer'>('operator');

  // Edit Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'operator' | 'viewer'>('operator');
  const [editPassword, setEditPassword] = useState('');
  const [userPermissions, setUserPermissions] = useState<UserEndpointPermission[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const loadUserPermissions = async (userId: string) => {
    setLoadingPermissions(true);
    try {
      const res = await api.get<{ permissions: UserEndpointPermission[] }>(`/users/${userId}/permissions`);
      setUserPermissions(res.permissions || []);
    } catch (e: any) {
      console.error('Failed to load permissions', e);
    } finally {
      setLoadingPermissions(false);
    }
  };

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
      toast.error(e?.message || t('common.error'));
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

    if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error(tr("Le mot de passe doit comporter au moins 10 caractères, 1 majuscule, 1 minuscule et 1 chiffre."));
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });
      toast.success(t('common.success'));
      setCreateModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditPassword('');
    setEditModalOpen(true);
    if (u.role !== 'admin') {
      loadUserPermissions(u.id);
    } else {
      setUserPermissions([]);
    }
  };

  const handleRoleChange = (newRoleVal: 'admin' | 'operator' | 'viewer') => {
    setEditRole(newRoleVal);
    if (newRoleVal !== 'admin' && editingUser && userPermissions.length === 0) {
      loadUserPermissions(editingUser.id);
    }
  };

  const handleTogglePermission = (endpointId: string, field: 'can_write' | 'can_publish') => {
    setUserPermissions(prev =>
      prev.map(p => {
        if (p.endpoint_id !== endpointId) return p;
        return { ...p, [field]: !p[field] };
      })
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (editPassword && (editPassword.length < 10 || !/[A-Z]/.test(editPassword) || !/[a-z]/.test(editPassword) || !/[0-9]/.test(editPassword))) {
      toast.error(tr("Le nouveau mot de passe doit comporter au moins 10 caractères, 1 majuscule, 1 minuscule et 1 chiffre."));
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/users/${editingUser.id}`, {
        role: editRole,
        password: editPassword || undefined
      });

      if (editRole !== 'admin' && userPermissions.length > 0) {
        await api.put(`/users/${editingUser.id}/permissions`, {
          permissions: userPermissions.map(p => ({
            endpoint_id: p.endpoint_id,
            can_write: p.can_write,
            can_publish: p.can_publish
          }))
        });
      }

      toast.success(t('common.success'));
      setEditModalOpen(false);
      setEditingUser(null);
      setEditPassword('');
      setUserPermissions([]);
      loadData();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.id === currentUser?.id) {
      toast.error(t('users.cannot_delete_self'));
      return;
    }
    if (!window.confirm(t('users.delete_confirm'))) {
      return;
    }

    try {
      await api.delete(`/users/${u.id}`);
      toast.success(t('common.success'));
      loadData();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight font-sans">
            {t('users.title')}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {t('users.subtitle')}
          </p>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            {t('users.add_user')}
          </button>
        )}
      </div>

      {/* Segmented Tabs */}
      <div className="flex items-center space-x-1 border-b border-zinc-200 dark:border-zinc-800 pb-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'users'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {t('users.tab_users')} ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-md transition ${
            activeTab === 'audit'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {t('users.tab_audit')}
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-800/40">
                  <th className="py-2.5 px-4">{t('users.username')}</th>
                  <th className="py-2.5 px-4">{t('users.role')}</th>
                  <th className="py-2.5 px-4">{t('users.security_2fa')}</th>
                  <th className="py-2.5 px-4">{t('users.last_login')}</th>
                  <th className="py-2.5 px-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition">
                    <td className="py-2.5 px-4 font-medium text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                      <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{u.username}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 font-mono">
                          {tr("(current)")} </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                          u.role === 'admin'
                            ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                            : u.role === 'operator'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        {u.role === 'admin'
                          ? t('nav.role_admin')
                          : u.role === 'operator'
                          ? t('nav.role_operator')
                          : t('nav.role_viewer')}
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      {u.totp_enabled ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{tr("Active")}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-mono text-[11px]">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-zinc-500 font-mono text-[11px]">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString(locale()) : '—'}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          title={t('users.edit_user')}
                          className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            title={t('common.delete')}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-800/40">
                  <th className="py-2.5 px-4">{t('audit.date')}</th>
                  <th className="py-2.5 px-4">{t('audit.user')}</th>
                  <th className="py-2.5 px-4">{t('audit.action')}</th>
                  <th className="py-2.5 px-4">{t('audit.target')}</th>
                  <th className="py-2.5 px-4">{t('audit.details')}</th>
                  <th className="py-2.5 px-4">{t('audit.ip')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition">
                    <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(locale())}
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-zinc-800 dark:text-zinc-200">
                      {log.user_name || tr("System")}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-zinc-500">
                      {log.entity_type}:{log.entity_id?.slice(0, 8) || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-500 max-w-xs truncate font-sans text-xs">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-400">
                      {log.ip_address || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={t('users.add_user')}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t('users.username')}
            </label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              placeholder="e.g. dev_operator"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t('users.password')}
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              placeholder="••••••••••••"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              {tr("Min. 10 chars (1 uppercase, 1 lowercase, 1 digit)")} </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t('users.role')}
            </label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            >
              <option value="operator">{t('nav.role_operator')}</option>
              <option value="admin">{t('nav.role_admin')}</option>
              <option value="viewer">{t('nav.role_viewer')}</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition disabled:opacity-50"
            >
              {t('common.create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`${t('users.edit_user')} (${editingUser?.username})`}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t('users.role')}
            </label>
            <select
              value={editRole}
              onChange={e => handleRoleChange(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            >
              <option value="operator">{t('nav.role_operator')}</option>
              <option value="admin">{t('nav.role_admin')}</option>
              <option value="viewer">{t('nav.role_viewer')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {t('users.password')}
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              placeholder="••••••••••••"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              {t('users.leave_blank')}
            </p>
          </div>

          {/* Granular Permissions Section */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="mb-2">
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {t('users.permissions')}
              </h4>
              <p className="text-[11px] text-zinc-500">
                {t('users.permissions_desc')}
              </p>
            </div>

            {editRole === 'admin' ? (
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-400">
                {t('users.admin_bypass')}
              </div>
            ) : loadingPermissions ? (
              <div className="py-4 text-center text-xs text-zinc-400">
                {t('common.loading')}
              </div>
            ) : userPermissions.length === 0 ? (
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 text-[11px] text-zinc-400">
                {tr("Aucun endpoint disponible pour la configuration.")} </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
                {userPermissions.map(p => (
                  <div key={p.endpoint_id} className="p-2.5 flex items-center justify-between text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <div className="truncate mr-3">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                        {p.endpoint_name}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 truncate block">
                        /{p.endpoint_slug}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0 font-mono text-[11px]">
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.can_write}
                          onChange={() => handleTogglePermission(p.endpoint_id, 'can_write')}
                          className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-0"
                        />
                        <span className="text-zinc-600 dark:text-zinc-400">{t('users.can_write')}</span>
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.can_publish}
                          onChange={() => handleTogglePermission(p.endpoint_id, 'can_publish')}
                          className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-0"
                        />
                        <span className="text-zinc-600 dark:text-zinc-400">{t('users.can_publish')}</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
