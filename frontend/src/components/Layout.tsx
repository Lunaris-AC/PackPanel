import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  Users,
  Moon,
  Sun,
  LogOut,
  Radio,
  Layers,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
  currentTab: string;
  onNavigate: (tab: string, meta?: any) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentTab, onNavigate, children }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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

    return () => {
      if (es) es.close();
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'endpoints', label: 'Endpoints', icon: Server },
    { id: 'jobs', label: 'Tâches d’arrière-plan', icon: Activity },
    ...(user?.role === 'admin'
      ? [{ id: 'users', label: 'Utilisateurs & Audit', icon: Users }]
      : [])
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-0 -translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand-500/20 text-white font-bold text-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-lg">
                PackPanel
              </span>
              <span className="block text-[10px] uppercase font-semibold text-brand-600 dark:text-brand-400 tracking-wider">
                Distribution
              </span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 ${active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom Status & Info */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span className="flex items-center">
              <Radio
                className={`w-3.5 h-3.5 mr-1.5 ${
                  sseConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'
                }`}
              />
              {sseConnected ? 'En direct' : 'Hors ligne'}
            </span>
            <span className="font-mono text-[11px]">v1.0.0</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="truncate mr-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                {user?.username}
              </p>
              <p className="text-[11px] text-slate-400 capitalize">
                {user?.role === 'admin' ? 'Administrateur' : user?.role === 'operator' ? 'Opérateur' : 'Lecteur'}
              </p>
            </div>
            <button
              onClick={logout}
              title="Déconnexion"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb representation */}
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-slate-400 font-medium">PackPanel</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className="text-slate-900 dark:text-slate-100 font-semibold capitalize">
                {currentTab.split(':')[0]}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
              aria-label="Basculer thème"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};
