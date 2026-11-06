import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import { I18nProvider } from './i18n';
import { AppContent } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
