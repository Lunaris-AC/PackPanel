import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { InstancesListPage } from './pages/instances/InstancesListPage';
import { NewInstanceWizard } from './pages/instances/NewInstanceWizard';
import { InstanceDetailPage } from './pages/instances/InstanceDetailPage';
import { JobsPage } from './pages/JobsPage';
import { UsersPage } from './pages/UsersPage';

const AuthenticatedApp: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/instances" replace />} />
        <Route
          path="/dashboard"
          element={
            <DashboardPage
              onNavigate={(tab) => {
                if (tab === 'endpoints' || tab === 'instances') navigate('/instances');
                else if (tab.startsWith('endpoint:')) navigate(`/instances/${tab.split(':')[1]}/overview`);
                else navigate(`/${tab}`);
              }}
            />
          }
        />
        <Route path="/instances" element={<InstancesListPage />} />
        <Route path="/instances/new" element={<NewInstanceWizard />} />
        <Route path="/instances/:id" element={<InstanceDetailPage />} />
        <Route path="/instances/:id/:tab" element={<InstanceDetailPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        {user?.role === 'admin' && <Route path="/users" element={<UsersPage />} />}

        {/* Backward Compatibility */}
        <Route path="/endpoints" element={<Navigate to="/instances" replace />} />
        <Route path="/endpoints/:id" element={<Navigate to="/instances" replace />} />
        <Route path="/launchers" element={<Navigate to="/instances" replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/instances" replace />} />
      </Routes>
    </Layout>
  );
};

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="text-xs text-zinc-400 font-medium">Chargement de PackPanel...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <AuthenticatedApp />
    </BrowserRouter>
  );
};
