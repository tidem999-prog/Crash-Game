import React, { useState, useEffect } from 'react';
import { apiRequest } from '../context/AuthContext';
import { 
  ShieldAlert, Landmark, CheckCircle, XCircle, Users, 
  TrendingUp, ArrowDownRight, ArrowUpRight, Ban, Check, AlertTriangle, Eye, Coins, ArrowLeft, Search,
  Film, Video
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Admin() {
  const [stats, setStats] = useState({
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalWithdrawalFees: 0,
    totalUserBalances: 0,
    usersCount: 0,
    totalBets: 0,
    totalPayouts: 0,
    houseGameProfit: 0,
    totalPlatformProfit: 0
  });

  const [transactions, setTransactions] = useState([]);
  const [visibleTransactionsCount, setVisibleTransactionsCount] = useState(15);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compConfigs, setCompConfigs] = useState([]);
  const [editingConfig, setEditingConfig] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // stores transaction ID being processed
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null); // stores image url to view in modal

  // USDT and Global settings
  const [globalSettings, setGlobalSettings] = useState([]);
  const [editingSetting, setEditingSetting] = useState(null);

  // Search User Bets
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResult, setSearchResult] = useState(null);

  const handleSearchUserBets = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const data = await apiRequest(`/api/admin/user-bets?query=${encodeURIComponent(searchQuery)}`);
      setSearchResult(data);
    } catch (err) {
      setSearchError(err.message || 'Erreur lors de la recherche.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Videos Management
  const [videos, setVideos] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoType, setVideoType] = useState('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUploadLoading, setVideoUploadLoading] = useState(false);

  const fetchVideos = async () => {
    try {
      const data = await apiRequest('/api/videos');
      setVideos(data);
    } catch (err) {
      console.error('Error fetching videos in admin:', err);
    }
  };

  const handleAddVideo = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    setVideoUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append('title', videoTitle);
      formData.append('type', videoType);
      if (videoType === 'youtube') {
        formData.append('youtubeUrl', youtubeUrl);
      } else if (videoFile) {
        formData.append('videoFile', videoFile);
      } else {
        throw new Error('Veuillez uploader un fichier vidéo.');
      }

      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/videos/admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'ajout.");
      }

      setAdminSuccess('La vidéo a été ajoutée avec succès.');
      setVideoTitle('');
      setYoutubeUrl('');
      setVideoFile(null);
      const fileInput = document.getElementById('adminVideoFileInput');
      if (fileInput) fileInput.value = '';
      await fetchVideos();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setVideoUploadLoading(false);
    }
  };

  const handleDeleteVideo = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette vidéo ?')) return;
    setAdminError('');
    setAdminSuccess('');
    try {
      await apiRequest(`/api/videos/admin/${id}`, { method: 'DELETE' });
      setAdminSuccess('La vidéo a été supprimée.');
      await fetchVideos();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de la suppression.');
    }
  };

  const fetchAdminData = async () => {
    setLoading(true);
    setAdminError('');
    try {
      const statsData = await apiRequest('/api/admin/stats');
      setStats(statsData);

      const txsData = await apiRequest('/api/admin/transactions');
      setTransactions(txsData);

      const usersData = await apiRequest('/api/admin/users');
      setUsers(usersData);

      const configsData = await apiRequest('/api/admin/competitions/config');
      setCompConfigs(configsData);

      const settingsData = await apiRequest('/api/admin/settings');
      setGlobalSettings(settingsData);

      await fetchVideos();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors du chargement des données administratives.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleApprove = async (id) => {
    setActionLoading(id);
    setAdminError('');
    setAdminSuccess('');
    try {
      await apiRequest(`/api/admin/transactions/${id}/approve`, { method: 'POST' });
      setAdminSuccess('La transaction a été approuvée.');
      await fetchAdminData();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de l\'approbation.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    setAdminError('');
    setAdminSuccess('');
    try {
      await apiRequest(`/api/admin/transactions/${id}/reject`, { method: 'POST' });
      setAdminSuccess('La transaction a été refusée et les soldes ont été ajustés.');
      await fetchAdminData();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors du refus.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSuspend = async (userId) => {
    setAdminError('');
    setAdminSuccess('');
    try {
      const data = await apiRequest(`/api/admin/users/${userId}/toggle-suspend`, { method: 'POST' });
      setAdminSuccess(data.message);
      await fetchAdminData();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors du changement de statut.');
    }
  };

  const handleReset = async (type) => {
    if (!window.confirm("Êtes-vous sûr de vouloir réinitialiser ces données à 0 ? Cette action supprimera définitivement les enregistrements correspondants et est irréversible.")) {
      return;
    }
    setAdminError('');
    setAdminSuccess('');
    try {
      const data = await apiRequest(`/api/admin/reset/${type}`, { method: 'POST' });
      setAdminSuccess(data.message);
      await fetchAdminData();
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de la réinitialisation.');
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    try {
      let parsedDist = editingConfig.payout_distribution;
      if (typeof parsedDist === 'string') {
        parsedDist = parsedDist.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
      }
      
      let parsedExtra = editingConfig.extra_settings;
      if (typeof parsedExtra === 'string') {
        parsedExtra = JSON.parse(parsedExtra);
      }

      await apiRequest('/api/admin/competitions/config', {
        method: 'POST',
        body: JSON.stringify({
          ...editingConfig,
          payout_distribution: parsedDist,
          extra_settings: parsedExtra
        })
      });

      setAdminSuccess(`La configuration de compétition '${editingConfig.key}' a été enregistrée.`);
      setEditingConfig(null);
      
      const configsData = await apiRequest('/api/admin/competitions/config');
      setCompConfigs(configsData);
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de la sauvegarde de la configuration.');
    }
  };

  const handleSaveSetting = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    try {
      await apiRequest('/api/admin/settings', {
        method: 'POST',
        body: {
          key: editingSetting.key,
          value: editingSetting.value
        }
      });
      setAdminSuccess(`Le paramètre '${editingSetting.key}' a été enregistré.`);
      setEditingSetting(null);
      const settingsData = await apiRequest('/api/admin/settings');
      setGlobalSettings(settingsData);
    } catch (err) {
      setAdminError(err.message || 'Erreur lors de la sauvegarde du paramètre.');
    }
  };

  const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin; // Target port for development uploads

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex items-center space-x-3">
          <Link to="/dashboard" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="bg-purple-900/40 p-3 rounded-2xl text-purple-400 border border-purple-800/50 shadow-md">
            <ShieldAlert className="h-6 w-6" />
          </div>
        </div>
        <div>
          <h2 className="font-display font-black text-3xl text-white">Panneau d'Administration</h2>
          <p className="text-sm text-slate-400">Contrôlez les transactions de la plateforme, examinez les preuves de paiement et modérez les utilisateurs.</p>
        </div>
      </div>

      {/* Notifications */}
      {adminError && (
        <div className="p-4 bg-red-950/40 border border-red-500/30 text-red-300 text-sm rounded-xl flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{adminError}</span>
        </div>
      )}
      {adminSuccess && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl flex items-center space-x-2">
          <Check className="h-5 w-5 shrink-0" />
          <span>{adminSuccess}</span>
        </div>
      )}

      {/* Statistics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        
        {/* Card 1: Profits Jeux */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden bg-gradient-to-br from-indigo-950/30 to-purple-950/20 border border-indigo-900/30 flex flex-col justify-between">
          <div>
            <div className="absolute top-4 right-4 h-9 w-9 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Profits Jeux</span>
            <h3 className="text-xl font-display font-black text-indigo-400 mt-1.5 font-mono">
              {stats.houseGameProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </h3>
            <p className="text-[9px] text-slate-500 mt-1">Mises moins les retours de gains.</p>
          </div>
          <button
            onClick={() => handleReset('profits')}
            className="mt-4 text-[9px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider w-fit"
          >
            Reset
          </button>
        </div>

        {/* Card 2: Profits sur Retraits */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden bg-gradient-to-br from-indigo-950/30 to-purple-950/20 border border-indigo-900/30 flex flex-col justify-between">
          <div>
            <div className="absolute top-4 right-4 h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
              <Coins className="h-4.5 w-4.5" />
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Profits Retraits (10%)</span>
            <h3 className="text-xl font-display font-black text-emerald-400 mt-1.5 font-mono">
              {stats.totalWithdrawalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </h3>
            <p className="text-[9px] text-slate-500 mt-1">Frais de 10% appliqués aux retraits.</p>
          </div>
          <button
            onClick={() => handleReset('withdrawals')}
            className="mt-4 text-[9px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider w-fit"
          >
            Reset
          </button>
        </div>

        {/* Card 3: User Balances */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="absolute top-4 right-4 h-9 w-9 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
              <Landmark className="h-4.5 w-4.5" />
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Caisse Joueurs</span>
            <h3 className="text-xl font-display font-black text-slate-200 mt-1.5 font-mono">
              {stats.totalUserBalances.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </h3>
            <p className="text-[9px] text-slate-500 mt-1">Soldes des {stats.usersCount} utilisateurs actifs.</p>
          </div>
          <button
            onClick={() => handleReset('balances')}
            className="mt-4 text-[9px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider w-fit"
          >
            Reset
          </button>
        </div>

        {/* Card 4: Total Deposits */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="absolute top-4 right-4 h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
              <ArrowUpRight className="h-4.5 w-4.5" />
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Dépôts Approuvés</span>
            <h3 className="text-xl font-display font-black text-slate-200 mt-1.5 font-mono">
              {stats.totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </h3>
            <p className="text-[9px] text-slate-500 mt-1">Dépôts cumulés validés.</p>
          </div>
          <button
            onClick={() => handleReset('deposits')}
            className="mt-4 text-[9px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider w-fit"
          >
            Reset
          </button>
        </div>

        {/* Card 5: Total Withdrawals */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="absolute top-4 right-4 h-9 w-9 bg-red-500/10 rounded-lg flex items-center justify-center text-red-400">
              <ArrowDownRight className="h-4.5 w-4.5" />
            </div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Retraits Approuvés</span>
            <h3 className="text-xl font-display font-black text-slate-200 mt-1.5 font-mono">
              {stats.totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })} HTG
            </h3>
            <p className="text-[9px] text-slate-500 mt-1">Retraits cumulés validés.</p>
          </div>
          <button
            onClick={() => handleReset('withdrawals')}
            className="mt-4 text-[9px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider w-fit"
          >
            Reset
          </button>
        </div>

      </div>

      {/* User Activity Search Section */}
      <div className="glass-panel p-6 rounded-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-900 pb-3 gap-4">
          <h3 className="font-display font-black text-lg text-slate-200 flex items-center space-x-2">
            <Search className="h-5 w-5 text-indigo-400" />
            <span>Recherche d'Activité Utilisateur</span>
          </h3>
          <form onSubmit={handleSearchUserBets} className="flex space-x-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="ID Utilisateur ou Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950/50 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full sm:w-64 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {searchLoading ? '...' : 'Chercher'}
            </button>
          </form>
        </div>

        {searchError && (
          <div className="text-red-400 text-xs">{searchError}</div>
        )}

        {searchResult && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>Résultats pour :</span>
              <span className="font-bold text-slate-200">{searchResult.user.email}</span>
              <span className="text-xs font-mono bg-slate-900 px-2 py-0.5 rounded text-slate-500">{searchResult.user.id}</span>
            </div>
            
            {searchResult.bets.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Aucune activité trouvée pour cet utilisateur.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="pb-3">Activité / Jeu</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Mise / Montant</th>
                      <th className="pb-3">Mult.</th>
                      <th className="pb-3">Solde Résultant</th>
                      <th className="pb-3 text-right">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {searchResult.bets.map((bet, idx) => {
                      const getActivityLabel = (act) => {
                        if (act.activity_type === 'bet') {
                          return act.game_id ? 'Crash Plane' : 'Snake (Ketmesye)';
                        }
                        if (act.activity_type === 'mines') {
                          return 'Mines';
                        }
                        if (act.activity_type === 'transaction') {
                          const typeLabel = act.tx_type === 'deposit' ? 'Dépôt' : 'Retrait';
                          const providerLabel = act.provider ? act.provider.toUpperCase() : '';
                          return `${typeLabel} ${providerLabel ? `(${providerLabel})` : ''}`;
                        }
                        if (act.activity_type === 'koth') {
                          if (act.action === 'JOIN_ESCROW_DEDUCTION') return 'KOTH (Mise)';
                          if (act.action === 'WIN_POT_DISTRIBUTION') return 'KOTH (Victoire)';
                          if (act.action === 'REFUND_CANCELLED_ROOM') return 'KOTH (Remboursement)';
                          return 'KOTH';
                        }
                        return 'Activité';
                      };

                      const renderResult = (act) => {
                        if (act.activity_type === 'bet') {
                          return act.is_won ? (
                            <span className="text-emerald-400 font-bold font-mono">+{act.payout_amount.toFixed(2)} HTG</span>
                          ) : (
                            <span className="text-red-400 font-bold font-mono">Perdu</span>
                          );
                        }
                        if (act.activity_type === 'mines') {
                          if (act.status === 'cashed_out') {
                            return <span className="text-emerald-400 font-bold font-mono">+{act.payout_amount.toFixed(2)} HTG</span>;
                          }
                          if (act.status === 'lost') {
                            return <span className="text-red-400 font-bold font-mono">Perdu</span>;
                          }
                          return <span className="text-amber-400 font-bold font-mono">En cours</span>;
                        }
                        if (act.activity_type === 'transaction') {
                          if (act.tx_type === 'deposit') {
                            if (act.status === 'approved') {
                              return <span className="text-emerald-400 font-bold font-mono">+{act.payout_amount.toFixed(2)} HTG</span>;
                            }
                            if (act.status === 'pending') {
                              return <span className="text-amber-400 font-bold font-mono">En attente</span>;
                            }
                            return <span className="text-red-400 font-bold font-mono">Refusé</span>;
                          } else {
                            if (act.status === 'approved') {
                              return <span className="text-red-400 font-bold font-mono">-{act.bet_amount.toFixed(2)} HTG</span>;
                            }
                            if (act.status === 'pending') {
                              return <span className="text-amber-400 font-bold font-mono">En attente</span>;
                            }
                            return <span className="text-slate-400 font-bold font-mono">Refusé (Remboursé)</span>;
                          }
                        }
                        if (act.activity_type === 'koth') {
                          if (act.action === 'JOIN_ESCROW_DEDUCTION') {
                            return <span className="text-red-400 font-bold font-mono">-{act.bet_amount.toFixed(2)} HTG</span>;
                          }
                          if (act.action === 'WIN_POT_DISTRIBUTION') {
                            return <span className="text-emerald-400 font-bold font-mono">+{act.bet_amount.toFixed(2)} HTG</span>;
                          }
                          if (act.action === 'REFUND_CANCELLED_ROOM') {
                            return <span className="text-emerald-400/70 font-bold font-mono">+{act.bet_amount.toFixed(2)} HTG (Remboursé)</span>;
                          }
                        }
                        return null;
                      };

                      return (
                        <tr key={idx} className="hover:bg-slate-900/15">
                          <td className="py-3 font-bold text-slate-300">
                            {getActivityLabel(bet)}
                          </td>
                          <td className="py-3 text-[10px] text-slate-500 font-mono">
                            {new Date(bet.created_at).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3 font-mono font-bold text-slate-400">
                            {bet.bet_amount.toFixed(2)}
                          </td>
                          <td className="py-3 font-mono text-slate-400">
                            {bet.cashout_multiplier ? `${bet.cashout_multiplier.toFixed(2)}x` : '-'}
                          </td>
                          <td className="py-3 font-mono text-slate-200 font-bold">
                            {bet.balance_after ? `${bet.balance_after.toFixed(2)} HTG` : '-'}
                          </td>
                          <td className="py-3 text-right">
                            {renderResult(bet)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid: Left - Pending Transactions / Right - User Account Suspend moderation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Pending Transactions list */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl space-y-4">
          <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3">
            Transactions en Attente & Récentes
          </h3>

          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">Aucune transaction en attente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="pb-3">Utilisateur</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Plateforme / Tel</th>
                    <th className="pb-3">Brut (HTG)</th>
                    <th className="pb-3">Net (HTG)</th>
                    <th className="pb-3">Reçu</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {transactions.slice(0, visibleTransactionsCount).map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/15">
                      <td className="py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-300">{tx.email.split('@')[0]}</span>
                          <span className="text-[9px] text-slate-500 font-mono">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                          tx.type === 'deposit' ? 'bg-emerald-950/60 border border-emerald-500/20 text-emerald-400' : 'bg-red-950/60 border border-red-500/20 text-red-400'
                        }`}>
                          {tx.type === 'deposit' ? 'Dépôt' : 'Retrait'}
                        </span>
                      </td>
                      <td className="py-4 text-slate-300 font-medium">
                        {tx.type === 'deposit' 
                          ? (tx.provider === 'usdt_bep20' ? 'USDT BEP20' : tx.provider.toUpperCase()) 
                          : `${tx.provider ? (tx.provider === 'usdt_bep20' ? 'USDT BEP20' : tx.provider.toUpperCase()) : 'MONCASH'} (Vers ${
                              tx.provider === 'usdt_bep20' 
                                ? `${tx.phone_number.substring(0, 6)}...${tx.phone_number.substring(tx.phone_number.length - 4)}` 
                                : tx.phone_number
                            })`
                        }
                      </td>
                      <td className="py-4 font-mono font-bold text-slate-400">
                        {tx.amount.toFixed(tx.provider === 'usdt_bep20' ? 4 : 2)} {tx.provider === 'usdt_bep20' ? 'USDT' : 'HTG'}
                      </td>
                      <td className="py-4 font-mono font-bold text-slate-200">
                        {tx.net_amount.toFixed(tx.provider === 'usdt_bep20' ? 4 : 2)} {tx.provider === 'usdt_bep20' ? 'USDT' : 'HTG'}
                      </td>
                      <td className="py-4">
                        {tx.provider === 'usdt_bep20' ? (
                          <a
                            href={tx.type === 'deposit' ? `https://bscscan.com/tx/${tx.tx_hash}` : `https://bscscan.com/address/${tx.phone_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-450 hover:underline font-bold flex items-center space-x-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>BscScan</span>
                          </a>
                        ) : tx.screenshot_url ? (
                          <button
                            onClick={() => {
                              const finalUrl = tx.screenshot_url.startsWith('/api/') ? tx.screenshot_url : `/api${tx.screenshot_url}`;
                              setSelectedScreenshot(`${backendUrl}${finalUrl}`);
                            }}
                            className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 font-semibold"
                            title="Visualiser le reçu"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Voir</span>
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-4 text-right">
                        {tx.status === 'pending' ? (
                          <div className="flex justify-end space-x-1.5">
                            <button
                              onClick={() => handleApprove(tx.id)}
                              disabled={actionLoading !== null}
                              className="p-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg border border-emerald-500/20 transition-all"
                              title="Approuver"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReject(tx.id)}
                              disabled={actionLoading !== null}
                              className="p-1.5 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-lg border border-red-500/20 transition-all"
                              title="Refuser"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className={`text-[10px] font-bold ${
                            tx.status === 'approved' ? 'text-emerald-400' : 'text-slate-500'
                          }`}>
                            {tx.status === 'approved' ? 'Approuvé' : 'Refusé'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {transactions.length > visibleTransactionsCount && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleTransactionsCount(prev => prev + 15)}
                className="bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold px-6 py-2.5 rounded-xl text-xs border border-slate-800 hover:border-slate-700 transition-all uppercase tracking-wider shadow-sm active:scale-95"
              >
                Voir Plus
              </button>
            </div>
          )}
        </div>

        {/* Right Side: User moderation list */}
        <div className="glass-panel p-6 rounded-3xl space-y-4">
          <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3 flex items-center space-x-2">
            <Users className="h-5 w-5 text-indigo-400" />
            <span>Gestion Utilisateurs</span>
          </h3>

          <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
            {users.filter(u => u.role !== 'admin').map((u, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-900/60">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-300">{u.email}</span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold mt-0.5">{u.balance.toFixed(2)} HTG</span>
                </div>

                <button
                  onClick={() => handleToggleSuspend(u.id)}
                  className={`py-1.5 px-3 rounded-lg text-[10px] font-bold flex items-center space-x-1.5 transition-all ${
                    u.is_suspended 
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-500/10'
                      : 'bg-slate-900 hover:bg-red-900/20 text-slate-400 hover:text-red-400 border border-slate-800'
                  }`}
                  title={u.is_suspended ? 'Débloquer le compte' : 'Suspendre le compte'}
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>{u.is_suspended ? 'Suspendu' : 'Actif'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Configuration des Compétitions */}
      <div className="glass-panel p-6 rounded-3xl space-y-6">
        <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3 flex items-center space-x-2">
          <TrendingUp className="h-5 w-5 text-purple-400" />
          <span>Configuration des Compétitions (Prize Pools réels)</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {compConfigs.map(cfg => (
            <div key={cfg.key} className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between gap-4">
              <div>
                <span className="text-xs font-black text-purple-400 uppercase tracking-widest block">{cfg.key.replace('_', ' ')}</span>
                
                <div className="space-y-2 mt-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pourcentage Revenu:</span>
                    <span className="font-bold text-white">{cfg.percentage_revenue}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Prize Pool Min/Max:</span>
                    <span className="font-bold text-white">{parseFloat(cfg.min_prize_pool).toFixed(0)} / {parseFloat(cfg.max_prize_pool).toFixed(0)} HTG</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gagnants payés:</span>
                    <span className="font-bold text-white">{cfg.winner_count}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setEditingConfig({
                  ...cfg,
                  payout_distribution: Array.isArray(cfg.payout_distribution) ? cfg.payout_distribution.join(', ') : cfg.payout_distribution,
                  extra_settings: typeof cfg.extra_settings === 'object' ? JSON.stringify(cfg.extra_settings, null, 2) : cfg.extra_settings
                })}
                className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-bold rounded-xl text-xs border border-indigo-500/20 transition-all text-center"
              >
                Modifier la configuration
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration USDT et Paramètres Système */}
      <div className="glass-panel p-6 rounded-3xl space-y-6">
        <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3 flex items-center space-x-2">
          <Landmark className="h-5 w-5 text-indigo-405" />
          <span>Paramètres Système & USDT (BEP20)</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {globalSettings.map(setting => (
            <div key={setting.key} className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 flex flex-col justify-between gap-4">
              <div>
                <span className="text-xs font-black text-indigo-400 uppercase tracking-widest block font-display">
                  {setting.key.replace(/_/g, ' ')}
                </span>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                  {setting.description || 'Pas de description.'}
                </p>
                <div className="mt-3 p-3 bg-slate-950 border border-slate-900 rounded-xl">
                  <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Valeur actuelle :</span>
                  <span className="text-sm font-mono font-black text-white break-all mt-0.5 block">
                    {setting.value}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingSetting({ ...setting })}
                className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-bold rounded-xl text-xs border border-indigo-500/20 transition-all text-center cursor-pointer"
              >
                Modifier la valeur
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Config Editor Modal */}
      {editingConfig && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <form onSubmit={handleSaveConfig} className="glass-panel p-6 rounded-3xl max-w-lg w-full relative space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditingConfig(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-lg font-bold p-2 hover:bg-slate-800 rounded-full h-8 w-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
            <h4 className="font-display font-black text-lg text-slate-200 mb-2">Modifier Configuration: {editingConfig.key.toUpperCase()}</h4>
            
            <div className="space-y-3 text-sm">
              {editingConfig.key !== 'lucky_chest' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold uppercase">Pourcentage des revenus nets (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={editingConfig.percentage_revenue}
                      onChange={(e) => setEditingConfig({ ...editingConfig, percentage_revenue: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400 font-bold uppercase">Prize Pool Minimum (HTG)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingConfig.min_prize_pool}
                        onChange={(e) => setEditingConfig({ ...editingConfig, min_prize_pool: e.target.value })}
                        className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400 font-bold uppercase">Prize Pool Maximum (HTG)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingConfig.max_prize_pool}
                        onChange={(e) => setEditingConfig({ ...editingConfig, max_prize_pool: e.target.value })}
                        className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold uppercase">Nombre de gagnants payés</label>
                    <input
                      type="number"
                      required
                      value={editingConfig.winner_count}
                      onChange={(e) => setEditingConfig({ ...editingConfig, winner_count: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-bold uppercase">Distribution des gains (ex: 30, 20, 15... en %)</label>
                    <input
                      type="text"
                      required
                      value={editingConfig.payout_distribution}
                      onChange={(e) => setEditingConfig({ ...editingConfig, payout_distribution: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}

              {editingConfig.key === 'lucky_chest' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-bold uppercase">Configurations Avancées (JSON)</label>
                  <textarea
                    rows="10"
                    required
                    value={editingConfig.extra_settings}
                    onChange={(e) => setEditingConfig({ ...editingConfig, extra_settings: e.target.value })}
                    className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-650 hover:bg-indigo-600 text-white font-bold rounded-xl text-sm transition-all"
            >
              Enregistrer
            </button>
          </form>
        </div>
      )}
      {/* Setting Editor Modal */}
      {editingSetting && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <form onSubmit={handleSaveSetting} className="glass-panel p-6 rounded-3xl max-w-lg w-full relative space-y-4">
            <button
              type="button"
              onClick={() => setEditingSetting(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-lg font-bold p-2 hover:bg-slate-800 rounded-full h-8 w-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
            <h4 className="font-display font-black text-lg text-slate-200 mb-2">Modifier Paramètre: {editingSetting.key.toUpperCase()}</h4>
            <p className="text-xs text-slate-400">{editingSetting.description}</p>
            
            <div className="space-y-3 text-sm">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-bold uppercase">Nouvelle Valeur</label>
                {editingSetting.key.endsWith('_enabled') ? (
                  <select
                    value={editingSetting.value}
                    onChange={(e) => setEditingSetting({ ...editingSetting, value: e.target.value })}
                    className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="true">Activer (true)</option>
                    <option value="false">Désactiver (false)</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={editingSetting.value}
                    onChange={(e) => setEditingSetting({ ...editingSetting, value: e.target.value })}
                    className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500 font-mono font-bold"
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-650 hover:bg-indigo-600 text-white font-bold rounded-xl text-sm transition-all"
            >
              Enregistrer
            </button>
          </form>
        </div>
      )}

      {/* Gestion des Vidéos Panel */}
      <div className="glass-panel p-6 rounded-3xl space-y-6">
        <h3 className="font-display font-black text-lg text-slate-200 border-b border-slate-900 pb-3 flex items-center space-x-2">
          <Film className="h-5 w-5 text-rose-500" />
          <span>Gestion des Vidéos Tutoriels</span>
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Video Form */}
          <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-900 space-y-4">
            <h4 className="font-bold text-slate-350 text-sm">Ajouter un nouveau tutoriel</h4>
            
            <form onSubmit={handleAddVideo} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-400 font-bold uppercase text-[10px]">Titre du tutoriel</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Comment effectuer un dépôt ?"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-slate-400 font-bold uppercase text-[10px]">Source de la vidéo</label>
                <select
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 w-full focus:outline-none focus:border-indigo-500 font-bold"
                >
                  <option value="youtube">Lien YouTube / Shorts</option>
                  <option value="file">Fichier Vidéo (Upload direct)</option>
                </select>
              </div>

              {videoType === 'youtube' ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Lien YouTube</label>
                  <input
                    type="url"
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2 w-full focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-bold uppercase text-[10px]">Fichier Vidéo (.mp4, .webm... Max 100MB)</label>
                  <input
                    type="file"
                    id="adminVideoFileInput"
                    required
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files[0])}
                    className="bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 w-full focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={videoUploadLoading}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-rose-900/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {videoUploadLoading ? 'Upload en cours...' : 'Ajouter la vidéo'}
              </button>
            </form>
          </div>

          {/* Video List */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="font-bold text-slate-350 text-sm">Vidéos publiées</h4>
            
            {videos.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center bg-slate-950/20 rounded-2xl border border-slate-900/60">
                Aucune vidéo tutoriel n'a été ajoutée pour le moment.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-1">
                {videos.map((vid) => (
                  <div key={vid.id} className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="h-10 w-10 bg-rose-950/40 border border-rose-900/30 text-rose-450 rounded-lg flex items-center justify-center shrink-0">
                        <Video size={20} />
                      </div>
                      <div className="overflow-hidden">
                        <span className="text-xs font-bold text-slate-200 block truncate" title={vid.title}>
                          {vid.title}
                        </span>
                        <span className={`inline-block mt-0.5 text-[8px] font-bold uppercase px-1.5 py-0.2 rounded ${
                          vid.type === 'youtube' ? 'bg-red-950/60 border border-red-500/20 text-red-400' : 'bg-blue-950/60 border border-blue-500/20 text-blue-400'
                        }`}>
                          {vid.type === 'youtube' ? 'YouTube' : 'Fichier local'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteVideo(vid.id)}
                      className="text-[10px] bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-2.5 py-1.5 rounded-lg transition-all font-bold uppercase cursor-pointer"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Screenshot Viewer Overlay Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="glass-panel-heavy p-6 rounded-3xl max-w-2xl w-full relative">
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-lg font-bold p-2 hover:bg-slate-800 rounded-full h-8 w-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
            <h4 className="font-display font-black text-lg text-slate-200 mb-4">Reçu de Transaction</h4>
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 max-h-[80vh] overflow-y-auto">
              <img 
                src={selectedScreenshot} 
                alt="Reçu de transaction" 
                className="w-full h-auto object-contain"
                onError={(e) => {
                  e.target.src = 'https://placehold.co/600x400/0f172a/94a3b8?text=Image+Non+Disponible';
                  addNotification("Impossible de charger l'image locale.", "danger");
                }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2 text-center">Vérifiez les références du transfert par rapport à vos relevés MonCash / NatCash avant d'approuver.</p>
          </div>
        </div>
      )}

    </div>
  );
}
