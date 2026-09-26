import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  Users,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Languages,
  Sparkles,
  Shield,
  Box,
  Monitor
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { PackPanelLogo } from './Logo';
import { SetupWizard } from './SetupWizard';
import { TwoFactorModal } from './TwoFactorModal';

interface LayoutProps {
  currentTab: string;
  onNavigate: (tab: string, meta?: any) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentTab, onNavigate, children }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();

  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState<boolean>(false);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState<boolean>(false);

  useEffect(() => {
    // SSE Live Connection
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events', { withCredentials: true });
      es.onopen = () => setSseConnected(true);
      es.onerror = () => setSseConnected(false);
      es.addEventListener('heartbeat', () => setSseConnected(true));
    } catch (e) {
      setSseConnected(false);
    }

    // Auto-prompt setup wizard if admin and first visit
    const setupCompleted = localStorage.getItem('packpanel_setup_completed');
    if (!setupCompleted && user?.role === 'admin') {
      setSetupWizardOpen(true);
    }

    return () => {
      if (es) es.close();
    };
  }, [user]);

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'instances', label: language === 'fr' ? 'Instances Minecraft' : 'Minecraft Instances', icon: Box },
    { id: 'launchers', label: language === 'fr' ? 'Launchers' : 'Launchers', icon: Monitor },
    { id: 'endpoints', label: t('nav.endpoints'), icon: Server },
    { id: 'jobs', label: t('nav.jobs'), icon: Activity },
    ...(user?.role === 'admin'
      ? [{ id: 'users', label: t('nav.users'), icon: Users }]
      : [])
  ];

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-zinc-800">
          <PackPanelLogo size={24} showText={true} />
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 rounded-md text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id || currentTab.startsWith(`${item.id}:`);
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium transition ${
                  active
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className={`w-4 h-4 mr-2.5 shrink-0 ${active ? 'text-white dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Status & User Card */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 px-2 mb-2">
            <span className="flex items-center">
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  sseConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono">{sseConnected ? 'Live SSE' : 'Offline'}</span>
            </span>
            <span className="font-mono text-[10px] text-zinc-400">v2.0.0</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 px-2">
            <div className="truncate mr-2">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {user?.username}
              </p>
              <p className="text-[10px] font-mono text-zinc-400 capitalize">
                {user?.role === 'admin'
                  ? t('nav.role_admin')
                  : user?.role === 'operator'
                  ? t('nav.role_operator')
                  : t('nav.role_viewer')}
              </p>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={() => setTwoFactorModalOpen(true)}
                title={user?.totp_enabled ? (language === 'fr' ? 'Double authentification 2FA activée' : '2FA Active') : (language === 'fr' ? 'Configurer la 2FA' : 'Configure 2FA')}
                className={`p-1.5 rounded-md transition ${
                  user?.totp_enabled
                    ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={logout}
                title={t('nav.logout')}
                className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-5 z-10 shrink-0">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">PackPanel</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                {currentTab.split(':')[0]}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Language Selector */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md text-[11px] font-mono font-medium">
              <button
                onClick={() => setLanguage('fr')}
                className={`px-1.5 py-0.5 rounded transition ${
                  language === 'fr'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-bold'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-1.5 py-0.5 rounded transition ${
                  language === 'en'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-bold'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                EN
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-5 md:p-7">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Setup Wizard Modal */}
      <SetupWizard
        isOpen={setupWizardOpen}
        onClose={() => setSetupWizardOpen(false)}
        onComplete={(slug) => {
          if (slug) {
            onNavigate('endpoints');
          } else {
            window.location.reload();
          }
        }}
      />

      {/* Two-Factor Authentication Modal */}
      <TwoFactorModal
        isOpen={twoFactorModalOpen}
        onClose={() => setTwoFactorModalOpen(false)}
      />
    </div>
  );
};
