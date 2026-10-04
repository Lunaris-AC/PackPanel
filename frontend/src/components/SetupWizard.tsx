import React, { useState, useEffect } from 'react';
import { Shield, Globe, Box, Check, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { api } from '../api/client';
import { useToast } from './Toast';

interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (createdSlug?: string) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [filesFqdn, setFilesFqdn] = useState('mccdn.inferi.fr');
  const [adminFqdn, setAdminFqdn] = useState('panel.mccdn.internal');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [filesBaseUrl, setFilesBaseUrl] = useState<string | undefined>();
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modpackName, setModpackName] = useState('');
  const [modpackSlug, setModpackSlug] = useState('');

  useEffect(() => {
    if (isOpen) api.get<{ adminFqdn: string; filesFqdn: string; filesBaseUrl?: string }>('/system/public-config')
      .then(settings => { setAdminFqdn(settings.adminFqdn); setFilesFqdn(settings.filesFqdn); setFilesBaseUrl(settings.filesBaseUrl); })
      .catch(error => toast.error(error.message));
  }, [isOpen]);
  if (!isOpen) return null;

  const validatePassword = (pass: string): boolean => {
    return pass.length >= 10 && /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /[0-9]/.test(pass);
  };

  const handleNext = async () => {
    if (step === 2 && newPassword) {
      if (!currentPassword) { toast.error('Saisissez votre mot de passe actuel.'); return; }
      if (!validatePassword(newPassword)) {
        toast.error('Le mot de passe doit comporter au moins 10 caractères, 1 majuscule, 1 minuscule et 1 chiffre.');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('Les mots de passe ne correspondent pas.');
        return;
      }
    }
    setStep(s => s + 1);
  };

  const handleFinish = async () => {
    setSubmitting(true);
    let createdSlug = '';
    try {
      await api.put('/system/public-config', { adminFqdn, filesFqdn, filesBaseUrl });
      // 1. Change password if provided
      if (newPassword) {
        await api.post('/auth/change-password', {
          currentPassword,
          newPassword
        });
      }

      // 2. Create endpoint if requested
      if (modpackName.trim() && modpackSlug.trim()) {
        const res = await api.post<{ endpoint: { slug: string } }>('/endpoints', {
          name: modpackName.trim(),
          slug: modpackSlug.trim().toLowerCase(),
          cleanup_rules: ['mods']
        });
        createdSlug = res?.endpoint?.slug || modpackSlug.trim().toLowerCase();
      }

      localStorage.setItem('packpanel_setup_completed', 'true');
      toast.success(t('setup.done_title'));
      onClose();
      onComplete(createdSlug);
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Top Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between">
          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 mb-1.5">
              {t('setup.badge')}
            </span>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-sans tracking-tight">
              {t('setup.title')}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t('setup.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress Dots */}
        <div className="px-6 pt-4 flex items-center space-x-2">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-sky-500' : 'bg-zinc-100 dark:bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* Body Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100 font-semibold text-sm">
                <Globe className="w-4 h-4 text-sky-500" />
                <span>{t('setup.step1_title')}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {t('setup.step1_desc')}
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {t('setup.files_fqdn')}
                  </label>
                  <input
                    type="text"
                    value={filesFqdn}
                    onChange={e => setFilesFqdn(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="mccdn.inferi.fr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {t('setup.admin_fqdn')}
                  </label>
                  <input
                    type="text"
                    value={adminFqdn}
                    onChange={e => setAdminFqdn(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="panel.mccdn.internal"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Mot de passe actuel (si vous souhaitez le modifier)
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full p-2 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
            </label>
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100 font-semibold text-sm">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>{t('setup.step2_title')}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {t('setup.step2_desc')}
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {t('setup.new_password')}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="••••••••••••"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {t('setup.password_hint')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </div>
            </>
          )}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100 font-semibold text-sm">
                <Box className="w-4 h-4 text-indigo-500" />
                <span>{t('setup.step3_title')}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {t('setup.step3_desc')}
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {t('setup.modpack_name')}
                  </label>
                  <input
                    type="text"
                    value={modpackName}
                    onChange={e => {
                      setModpackName(e.target.value);
                      if (!modpackSlug || modpackSlug === e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')) {
                        setModpackSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-'));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="Create Adventures"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {t('setup.modpack_slug')}
                  </label>
                  <input
                    type="text"
                    value={modpackSlug}
                    onChange={e => setModpackSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="create-adventures"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                {t('common.back')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('packpanel_setup_completed', 'true');
                  onClose();
                }}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
              >
                {t('setup.skip_btn')}
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition"
              >
                <span>Suivant</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinish}
                className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                <span>{t('setup.finish_btn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
