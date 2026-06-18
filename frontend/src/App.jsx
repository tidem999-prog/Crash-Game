import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import SupportClient from './pages/SupportClient';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Terms from './pages/Terms';
import ChatWidget from './components/ChatWidget';
import { LogOut, User, RefreshCw, Landmark, ShieldAlert, Gamepad2, MessageCircle } from 'lucide-react';

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

const KetTokenIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" fill="url(#ketGrad)" stroke="currentColor" />
    <path d="M8 7v10M8 12h4l4-5M12 12l4 5" stroke="#ffffff" strokeWidth="3" />
    <defs>
      <linearGradient id="ketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
    </defs>
  </svg>
);

const HtgTokenIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" fill="url(#htgGrad)" stroke="currentColor" />
    <path d="M12 6v12M17 9H9.5a3.5 3.5 0 0 0 0 7H15" stroke="#ffffff" strokeWidth="3" />
    <defs>
      <linearGradient id="htgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
  </svg>
);

// Navigation Bar
const Navbar = () => {
  const { user, logout, refreshBalance, changeCurrency } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasUnreadSupport, setHasUnreadSupport] = useState(false);
  const socketRef = useRef(null);

  // Sidebar States
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Global socket for unread support messages notification AND auto-reload on update
  useEffect(() => {
    const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      if (user && user.role === 'admin') {
        socketRef.current.emit('join_admin');
      }
    });

    socketRef.current.on('server_version', (serverTime) => {
      const currentVersion = localStorage.getItem('app_version');
      if (!currentVersion) {
        localStorage.setItem('app_version', serverTime);
      } else if (currentVersion !== serverTime.toString()) {
        console.log('New update detected. Reloading page...');
        localStorage.setItem('app_version', serverTime);
        window.location.reload(true);
      }
    });

    socketRef.current.on('new_message', ({ message }) => {
      if (user && user.role === 'admin' && message.sender === 'user') {
        if (location.pathname !== '/admin/support') {
          setHasUnreadSupport(true);
        }
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [user, location.pathname]);

  useEffect(() => {
    if (location.pathname === '/admin/support') {
      setHasUnreadSupport(false);
    }
  }, [location.pathname]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (menuOpen || profileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen, profileOpen]);

  const navigateTo = (path) => {
    navigate(path);
    setMenuOpen(false);
    setProfileOpen(false);
  };

  if (!user) return null;

  return (
    <>
      {/* ===== MOBILE HEADER ===== */}
      <header className="mobile-header lg:hidden">
        <button className="header-btn menu-btn" onClick={() => { setMenuOpen(true); setProfileOpen(false); }} aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="header-center" onClick={() => navigateTo('/')} style={{ cursor: 'pointer' }}>
          <span className="header-brand">
            <span className="brand-k">KET</span><span className="brand-a">ARENA</span>
          </span>
        </div>

        <div className="header-balance" onClick={refreshBalance}>
          {user.active_currency === 'KET' ? (
             <span className="bal-amount">{Math.round(user.ket_balance || 0).toLocaleString('en-US')} <span className="bal-currency">KET</span></span>
          ) : (
             <span className="bal-amount">{user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="bal-currency">G</span></span>
          )}
          <button className="bal-refresh" aria-label="Refresh">
            <RefreshCw className="h-3 w-3 text-emerald-400" />
          </button>
        </div>

        <button className="header-btn profile-btn" onClick={() => { setProfileOpen(true); setMenuOpen(false); }} aria-label="Profile">
          <span className="avatar-text">{user.first_name ? user.first_name.substring(0,2).toUpperCase() : (user.email ? user.email.substring(0, 2).toUpperCase() : 'KT')}</span>
          <span className="avatar-online"></span>
        </button>
      </header>

      {/* ===== DESKTOP NAVBAR (Hidden on mobile) ===== */}
      <nav className="hidden lg:flex sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between w-full">
          <Link to="/" className="flex items-center space-x-1.5 group shrink-0">
            <div className="bg-gradient-to-tr from-yellow-500 to-indigo-600 p-1.5 sm:p-2 rounded-lg text-white transform group-hover:scale-105 transition-all duration-300 shadow-md shadow-indigo-500/20">
              <Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-display font-black text-sm sm:text-base tracking-tight uppercase">
              <span className="text-white">KET</span><span className="text-yellow-500">ARENA</span>
            </span>
          </Link>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-950/60 border border-slate-800 p-0.5 pl-1.5 sm:pl-3 pr-0.5 rounded-full shadow-inner select-none shrink-0">
              {user.active_currency === 'KET' ? (
                <>
                  <KetTokenIcon className="h-4 w-4 sm:h-5 sm:w-5 text-pink-400 shrink-0" />
                  <span className="font-mono font-bold text-[10px] sm:text-sm text-pink-400">
                    {Math.round(user.ket_balance || 0).toLocaleString('en-US')}<span className="text-[8px] sm:text-[10px] ml-0.5 text-pink-500/80">KET</span>
                  </span>
                </>
              ) : (
                <>
                  <HtgTokenIcon className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 shrink-0" />
                  <span className="font-mono font-bold text-[10px] sm:text-sm text-emerald-400">
                    {user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}<span className="text-[8px] sm:text-[10px] ml-0.5 text-emerald-500/80">G</span>
                  </span>
                </>
              )}
              <button onClick={refreshBalance} className="p-1 text-slate-400 hover:text-indigo-400 rounded-full hover:bg-slate-800 transition-all duration-200" title="Actualiser le solde">
                <RefreshCw className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
              </button>
              <button
                onClick={async () => {
                  const nextCurrency = user.active_currency === 'KET' ? 'HTG' : 'KET';
                  try { await changeCurrency(nextCurrency); } catch (err) { console.error('Failed to change currency:', err); }
                }}
                className={`text-[9px] sm:text-xs font-bold px-2 py-0.5 sm:py-1 rounded-full transition-all duration-300 ml-1 shadow-md ${
                  user.active_currency === 'KET' 
                    ? 'bg-pink-600 text-white shadow-pink-600/20 hover:bg-pink-500' 
                    : 'bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500'
                }`}
                title="Changer de devise"
              >
                {user.active_currency === 'KET' ? '→ HTG' : '→ KET'}
              </button>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <a href="https://whatsapp.com/channel/0029Vb59psgCnA7zPea8GT39" target="_blank" rel="noopener noreferrer" className="p-1 sm:p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/40 rounded-full transition-colors group" title="WhatsApp Channel">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </a>
              <a href="https://www.tiktok.com/@ketarena?_r=1&_t=ZS-97C95JlKF0f" target="_blank" rel="noopener noreferrer" className="p-1 sm:p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full transition-colors group" title="TikTok">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.53 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
              </a>
            </div>

            {user.role === 'admin' && (
              <div className="flex items-center space-x-2">
                <Link to="/admin" className="flex items-center space-x-1.5 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800/50 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold tracking-wide transition-all">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Portail Admin</span>
                </Link>
                <Link to="/admin/support" className="relative flex items-center space-x-1.5 bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-800/50 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold tracking-wide transition-all">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Support</span>
                  {hasUnreadSupport && <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10"></span>}
                </Link>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-300">{user.email.split('@')[0]}</span>
                <span className="text-[10px] text-slate-500 capitalize">{user.role}</span>
              </div>
              <button onClick={() => { logout(); navigate('/'); }} className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800/50 transition-all duration-200" title="Se déconnecter">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ===== LEFT SLIDE MENU (Hamburger) ===== */}
      <div className={`sidebar-overlay lg:hidden ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}></div>
      <aside className={`sidebar sidebar-left lg:hidden ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Gamepad2 className="h-5 w-5 text-white" />
            </div>
            <span className="sidebar-brand-text"><span className="brand-k">KET</span><span className="brand-a">ARENA</span></span>
          </div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/')}>
            <span className="nav-item-icon"><Gamepad2 className="h-5 w-5" /></span>
            <span className="nav-item-label">Jeu</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=deposit')}>
            <span className="nav-item-icon"><Landmark className="h-5 w-5" /></span>
            <span className="nav-item-label">Dépôt</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=withdraw')}>
            <span className="nav-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6h14M4 10v11M20 10v11M12 2v4M8 10v11M16 10v11"></path></svg></span>
            <span className="nav-item-label">Retrait</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=history')}>
            <span className="nav-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span>
            <span className="nav-item-label">Historique</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-balance-card">
            <div className="sbc-label">Solde disponible</div>
            <div className="sbc-value">{user.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} <span>HTG</span></div>
          </div>
        </div>
      </aside>

      {/* ===== RIGHT SLIDE PROFILE PANEL ===== */}
      <div className={`sidebar-overlay lg:hidden ${profileOpen ? 'open' : ''}`} onClick={() => setProfileOpen(false)}></div>
      <aside className={`sidebar sidebar-right lg:hidden ${profileOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Mon Profil</span>
          <button className="sidebar-close" onClick={() => setProfileOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="profile-card">
          <div className="profile-avatar-big">
            <span>{user.first_name ? user.first_name.substring(0,2).toUpperCase() : (user.email ? user.email.substring(0, 2).toUpperCase() : 'KT')}</span>
            <span className="avatar-online-big"></span>
          </div>
          <div className="profile-info">
            <div className="profile-name">{user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'KetMesye'}</div>
            <div className="profile-email">{user.email}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Compte</div>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=profile')}>
            <span className="nav-item-icon"><User className="h-5 w-5" /></span>
            <span className="nav-item-label">Informations du profil</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=profile')}>
            <span className="nav-item-icon"><RefreshCw className="h-5 w-5" /></span>
            <span className="nav-item-label">Convertir Jeton KET</span>
          </button>
          <button className="sidebar-nav-item has-value">
            <span className="nav-item-icon"><KetTokenIcon className="h-5 w-5 text-pink-400" /></span>
            <span className="nav-item-label">Balance KET</span>
            <span className="nav-item-value">{Math.round(user.ket_balance || 0).toLocaleString('fr-FR')} KET</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => navigateTo('/dashboard?tab=affiliate')}>
            <span className="nav-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span>
            <span className="nav-item-label">Parrainage</span>
          </button>

          <div className="nav-section-label" style={{ marginTop: '16px' }}>Réseaux sociaux</div>
          <a href="https://whatsapp.com/channel/0029Vb59psgCnA7zPea8GT39" target="_blank" rel="noopener noreferrer" className="sidebar-nav-item social-item" onClick={() => setProfileOpen(false)}>
            <span className="nav-item-icon social-icon" style={{ color: '#25D366' }}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
            </span>
            <span className="nav-item-label">WhatsApp</span>
            <svg className="nav-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"></path></svg>
          </a>
              <a href="https://www.tiktok.com/@ketarena?_r=1&_t=ZS-97C95JlKF0f" target="_blank" rel="noopener noreferrer" className="sidebar-nav-item social-item" onClick={() => setProfileOpen(false)}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.53 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
                <span className="nav-item-label">TikTok</span>
                <svg className="nav-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"></path></svg>
              </a>

          <div className="sidebar-divider"></div>

          <button className="sidebar-nav-item logout-item" onClick={() => { setProfileOpen(false); logout(); navigate('/'); }}>
            <span className="nav-item-icon"><LogOut className="h-5 w-5" /></span>
            <span className="nav-item-label">Déconnecter</span>
          </button>
        </nav>
      </aside>
    </>
  );
};


const AppContent = () => {
  const { user } = useAuth();
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
          <Route path="/terms" element={<Terms />} />
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
          <Route 
            path="/admin/support" 
            element={
              <AdminRoute>
                <SupportClient />
              </AdminRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {user?.role !== 'admin' && <ChatWidget />}
      
      {/* Premium Footer */}
      <footer className="border-t border-slate-900 py-4 sm:py-6 bg-slate-950 text-slate-500 text-center text-[10px] sm:text-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
          <p>© {new Date().getFullYear()} Ketarena. Tous droits réservés.</p>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:space-x-1.5 text-[9px] sm:text-xs">
            <span>Sécurisé avec House Edge de 5%</span>
            <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-emerald-500"></span>
            <span>Retraits validés manuellement</span>
          </div>
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

