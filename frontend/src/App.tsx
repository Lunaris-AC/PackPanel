import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { EndpointsPage } from './pages/EndpointsPage';
import { EndpointDetailPage } from './pages/EndpointDetailPage';
import { InstancesPage } from './pages/InstancesPage';
import { LaunchersPage } from './pages/LaunchersPage';
import { JobsPage } from './pages/JobsPage';
import { UsersPage } from './pages/UsersPage';

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500"></div>
          <span className="text-xs text-slate-400 font-medium">Chargement de PackPanel...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleNavigate = (tab: string) => {
    setCurrentTab(tab);
  };

  return (
    <Layout currentTab={currentTab} onNavigate={handleNavigate}>
      {currentTab === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {currentTab === 'instances' && <InstancesPage onNavigate={handleNavigate} />}
      {currentTab === 'launchers' && <LaunchersPage onNavigate={handleNavigate} />}
      {currentTab === 'endpoints' && <EndpointsPage onNavigate={handleNavigate} />}
      {currentTab.startsWith('endpoint:') && (
        <EndpointDetailPage
          endpointId={currentTab.split(':')[1]}
          onBack={() => setCurrentTab('endpoints')}
        />
      )}
      {currentTab === 'jobs' && <JobsPage />}
      {currentTab === 'users' && user.role === 'admin' && <UsersPage />}
    </Layout>
  );
};
