import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SnapshotProgressProvider } from './contexts/SnapshotProgressContext';
import { BackgroundJobsProvider } from './contexts/BackgroundJobsContext';
import BackgroundJobsWidget from './components/BackgroundJobsWidget';
import UpdatePromptModal from './components/UpdatePromptModal';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import Apps from './pages/Apps';
import AppDetail from './pages/AppDetail';
import Settings from './pages/Settings';
import Storage from './pages/Storage';
import Docs from './pages/Docs';
import ComingSoon from './components/ComingSoon';
import './styles/global.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SnapshotProgressProvider>
            <BackgroundJobsProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/servers" element={<Servers />} />
                  <Route path="/servers/:id" element={<ServerDetail />} />
                  <Route path="/apps" element={<Apps />} />
                  <Route path="/apps/:id" element={<AppDetail />} />
                  <Route path="/storage" element={<Storage />} />
                  <Route path="/connections" element={<ComingSoon title="Connections" icon="🔗" />} />
                  <Route path="/docs" element={<Docs />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
                <BackgroundJobsWidget />
                <UpdatePromptModal />
              </BrowserRouter>
            </BackgroundJobsProvider>
          </SnapshotProgressProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
