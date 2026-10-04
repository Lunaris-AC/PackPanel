import React, { useState } from 'react';
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { PackPanelLogo } from '../components/Logo';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { language, setLanguage } = useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (require2FA && !totpCode.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await login(username.trim(), password, require2FA ? totpCode.trim() : undefined);
      if (res.require2FA) {
        setRequire2FA(true);
      }
    } catch (err: any) {
      setError(err.message || (language === 'fr' ? 'Identifiants ou code 2FA invalide' : 'Invalid credentials or 2FA code'));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setRequire2FA(false);
    setTotpCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-6">
          <PackPanelLogo size={36} showText={true} className="mb-2" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center font-normal">
            {language === 'fr' 
              ? 'Distribution haute performance et sécurisée de modpacks' 
              : 'High-performance modpack management & distribution'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-xs">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-start space-x-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!require2FA ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    {language === 'fr' ? "Nom d'utilisateur" : 'Username'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
                      placeholder="admin"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    {language === 'fr' ? 'Mot de passe' : 'Password'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <span className="text-xs font-semibold">
                    {language === 'fr' ? 'Double authentification (2FA)' : 'Two-Factor Authentication (2FA)'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {language === 'fr'
                    ? 'Saisissez le code à 6 chiffres généré par votre application (Google Authenticator, Authy, Bitwarden) ou un code de secours.'
                    : 'Enter the 6-digit code generated by your authenticator app (Google Authenticator, Authy, Bitwarden) or an emergency recovery code.'}
                </p>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\s+/g, ''))}
                    className="w-full pl-9 pr-3 py-2 text-sm font-mono tracking-widest bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
                    placeholder="123456"
                    maxLength={10}
                    autoFocus
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white shadow-xs transition disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white dark:border-zinc-900"></div>
              ) : (
                <>
                  <span>
                    {require2FA
                      ? (language === 'fr' ? 'Vérifier et continuer' : 'Verify & Continue')
                      : (language === 'fr' ? 'Se connecter' : 'Sign In')}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </>
              )}
            </button>

            {require2FA && (
              <button
                type="button"
                onClick={handleBackToCredentials}
                className="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition pt-1"
              >
                {language === 'fr' ? '← Revenir aux identifiants' : '← Back to credentials'}
              </button>
            )}
          </form>
        </div>

        {/* Footer info & Language Switcher */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-400 px-2 font-mono">
          <span>PackPanel v2.0.0</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setLanguage('fr')}
              className={`hover:text-zinc-700 dark:hover:text-zinc-200 transition ${language === 'fr' ? 'font-bold text-zinc-900 dark:text-zinc-100' : ''}`}
            >
              FR
            </button>
            <span>/</span>
            <button
              onClick={() => setLanguage('en')}
              className={`hover:text-zinc-700 dark:hover:text-zinc-200 transition ${language === 'en' ? 'font-bold text-zinc-900 dark:text-zinc-100' : ''}`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
