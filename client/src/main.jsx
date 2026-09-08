import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Invite from './pages/Invite.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Campaign from './pages/Campaign.jsx';
import PaperView from './pages/PaperView.jsx';
import './styles.css';

function Private({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login register />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route element={<Private><Layout /></Private>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campaigns/:id/*" element={<Campaign />} />
            <Route path="/campaigns/:id/papers/:paperId" element={<PaperView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
