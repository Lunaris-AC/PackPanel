import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  X,
  Lock,
  Download,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();
  const { tr, language } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUrl: string;
    recoveryCodes: string[];
  } | null>(null);

  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSetupData(null);
      setConfirmCode('');
      setDisablePassword('');
      setError(null);
      setSuccess(null);
      return;
    }

    if (!user?.totp_enabled) {
      loadSetupData();
    }
  }, [isOpen, user?.totp_enabled]);

  const loadSetupData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ secret: string; otpauthUrl?: string; otpauthUri?: string; recoveryCodes: string[] }>('/auth/2fa/setup');
      setSetupData({
        secret: res.secret,
        otpauthUrl: res.otpauthUrl || res.otpauthUri || '',
        recoveryCodes: res.recoveryCodes
      });
    } catch (err: any) {
      setError(err.message || tr("Impossible de générer le secret 2FA"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyCodes = () => {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleDownloadCodes = () => {
    if (!setupData) return;
    const blob = new Blob(
      [`PackPanel Emergency Recovery Codes for ${user?.username}:\n\n` + setupData.recoveryCodes.join('\n')],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `packpanel-recovery-codes-${user?.username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || !confirmCode.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/2fa/enable', {
        secret: setupData.secret,
        code: confirmCode.trim(),
        totpCode: confirmCode.trim(),
        recoveryCodes: setupData.recoveryCodes
      });
      await refreshUser();
      setSuccess(
        language === 'fr'
          ? 'Double authentification activée avec succès !'
          : 'Two-factor authentication successfully enabled!'
      );
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || (language === 'fr' ? 'Code TOTP invalide' : 'Invalid TOTP code'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) return;

    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword });
      await refreshUser();
      setSuccess(
        language === 'fr'
          ? 'Double authentification désactivée.'
          : 'Two-factor authentication disabled.'
      );
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || (language === 'fr' ? tr("Mot de passe incorrect") : 'Incorrect password'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {language === 'fr' ? 'Sécurité du compte & Double authentification' : 'Account Security & 2FA'}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {user?.totp_enabled
                  ? (language === 'fr' ? '2FA actuellement activée' : '2FA currently enabled')
                  : (language === 'fr' ? 'Configurez une protection TOTP RFC 6238' : 'Configure RFC 6238 TOTP protection')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{success}</span>
            </div>
          )}

          {user?.totp_enabled ? (
            /* 2FA Enabled State - Allow Disable */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 flex items-center space-x-3">
                <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    {language === 'fr' ? 'Protection 2FA active' : '2FA Protection is active'}
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {language === 'fr'
                      ? 'Votre compte requiert un code de vérification à chaque connexion.'
                      : 'Your account requires an authenticator verification code at each login.'}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  {language === 'fr' ? 'Désactiver la double authentification' : 'Disable Two-Factor Authentication'}
                </h5>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">
                  {language === 'fr'
                    ? 'Pour désactiver la 2FA, veuillez confirmer votre mot de passe administrateur.'
                    : 'To disable 2FA, please enter your password to confirm.'}
                </p>

                <form onSubmit={handleDisable} className="space-y-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={disablePassword}
                      onChange={e => setDisablePassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-rose-500 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !disablePassword}
                    className="w-full py-2 px-4 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition disabled:opacity-50 flex items-center justify-center space-x-1.5"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>{language === 'fr' ? 'Désactiver la 2FA' : 'Disable 2FA'}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* 2FA Disabled State - Setup Flow */
            <div className="space-y-4">
              {loading && !setupData ? (
                <div className="py-8 flex justify-center items-center">
                  <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
                </div>
              ) : setupData ? (
                <>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {language === 'fr'
                      ? "1. Entrez la clé secrète ci-dessous dans votre application TOTP (Google Authenticator, Authy, Bitwarden, 1Password) ou utilisez l'URL otpauth."
                      : '1. Enter the secret key below into your TOTP authenticator (Google Authenticator, Authy, Bitwarden, 1Password) or use the otpauth URI.'}
                  </p>

                  {/* Secret Key Display */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                        {language === 'fr' ? 'Clé secrète (Base32)' : 'Secret Key (Base32)'}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyKey}
                        className="inline-flex items-center space-x-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                      >
                        {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey ? (language === 'fr' ? 'Copié' : 'Copied') : (language === 'fr' ? tr("Copier") : 'Copy')}</span>
                      </button>
                    </div>
                    <code className="text-sm font-mono font-bold tracking-wider text-zinc-900 dark:text-zinc-100 select-all block break-all">
                      {setupData.secret}
                    </code>
                  </div>

                  {/* Recovery Codes */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                        {language === 'fr' ? "Codes de secours d'urgence (Usage unique)" : 'Emergency Recovery Codes (Single-Use)'}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={handleCopyCodes}
                          className="inline-flex items-center space-x-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        >
                          {copiedCodes ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>{language === 'fr' ? tr("Copier") : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadCodes}
                          className="inline-flex items-center space-x-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                        >
                          <Download className="w-3 h-3" />
                          <span>TXT</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-lg">
                      {setupData.recoveryCodes.map((c, i) => (
                        <div key={i} className="font-mono text-[11px] text-center text-zinc-700 dark:text-zinc-300 py-0.5 bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
                          {c}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      {language === 'fr'
                        ? 'Conservez ces codes en lieu sûr. Ils permettent de récupérer votre compte en cas de perte de votre téléphone.'
                        : 'Store these codes safely. They can recover your account if you lose access to your device.'}
                    </p>
                  </div>

                  {/* Confirmation Step */}
                  <form onSubmit={handleEnable} className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        {language === 'fr'
                          ? '2. Saisissez le code à 6 chiffres pour valider :'
                          : '2. Enter 6-digit confirmation code:'}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={confirmCode}
                          onChange={e => setConfirmCode(e.target.value.replace(/\s+/g, ''))}
                          placeholder="123456"
                          maxLength={6}
                          className="w-full pl-9 pr-3 py-2 font-mono text-sm tracking-widest bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || confirmCode.trim().length !== 6}
                      className="w-full py-2 px-4 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white shadow-xs transition disabled:opacity-50 flex items-center justify-center space-x-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{language === 'fr' ? 'Activer la 2FA' : 'Enable 2FA'}</span>
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
