import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { LogOut, User, RefreshCw, Landmark, ShieldAlert, Gamepad2 } from 'lucide-react';

// Protected Route for normal users
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};

// Admin Protected Route
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
    </div>
  );
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
};

// Navigation Bar
const Navbar = () => {
  const { user, logout, refreshBalance } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2 group">
          <div className="bg-gradient-to-tr from-yellow-500 to-indigo-600 p-2 rounded-lg text-white transform group-hover:scale-105 transition-all duration-300 shadow-md shadow-indigo-500/20">
            <Gamepad2 className="h-5 w-5" />
          </div>
          <span className="font-display font-black text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent uppercase">
            KetMesye<span className="text-yellow-500">Arena</span>
          </span>
        </Link>

        {/* Action Controls & Profile */}
        <div className="flex items-center space-x-4">
          
          {/* Balance Widget */}
          <div className="flex items-center space-x-2 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
            <Landmark className="h-4 w-4 text-emerald-400" />
            <span className="font-mono font-bold text-sm text-emerald-400">
              {user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </span>
            <button 
              onClick={refreshBalance} 
              className="p-1 text-slate-400 hover:text-indigo-400 rounded-full hover:bg-slate-800 transition-all duration-200"
              title="Actualiser le solde"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Admin Link */}
          {user.role === 'admin' && (
            <Link 
              to="/admin" 
              className="flex items-center space-x-1.5 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800/50 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Portail Admin</span>
            </Link>
          )}

          {/* User Profile / Logout */}
          <div className="flex items-center space-x-2">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-300">{user.email.split('@')[0]}</span>
              <span className="text-[10px] text-slate-500 capitalize">{user.role}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800/50 transition-all duration-200"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>
    </nav>
  );
};

const AppContent = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />
      <main className="flex-grow flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      
      {/* Premium Footer */}
      <footer className="border-t border-slate-900 py-6 bg-brand-dark text-slate-500 text-center text-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KetMesye Arena. Tous droits réservés.</p>
          <p className="flex items-center space-x-1">
            <span>Sécurisé avec House Edge de 5%</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>Retraits validés manuellement</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
