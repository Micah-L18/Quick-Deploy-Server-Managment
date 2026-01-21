import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import Apps from './pages/Apps';
import AppDetail from './pages/AppDetail';
import Settings from './pages/Settings';
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
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/servers" element={<Servers />} />
              <Route path="/servers/:id" element={<ServerDetail />} />
              <Route path="/apps" element={<Apps />} />
              <Route path="/apps/:id" element={<AppDetail />} />
              <Route path="/connections" element={<ComingSoon title="Connections" icon="🔗" />} />
              <Route path="/docs" element={<ComingSoon title="Documentation" icon="📖" />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
