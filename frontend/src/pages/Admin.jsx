import React, { useState, useEffect } from 'react';
import { apiRequest } from '../context/AuthContext';
import { 
  ShieldAlert, Landmark, CheckCircle, XCircle, Users, 
  TrendingUp, ArrowDownRight, ArrowUpRight, Ban, Check, AlertTriangle, Eye, Coins
} from 'lucide-react';

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
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // stores transaction ID being processed
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null); // stores image url to view in modal

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

  const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin; // Target port for development uploads

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      
      {/* Page Header */}
      <div className="flex items-center space-x-3">
        <div className="bg-purple-900/40 p-3 rounded-2xl text-purple-400 border border-purple-800/50 shadow-md">
          <ShieldAlert className="h-6 w-6" />
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
                  {transactions.map((tx, idx) => (
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
                          ? tx.provider.toUpperCase() 
                          : `${tx.provider ? tx.provider.toUpperCase() : 'MONCASH'} (Vers ${tx.phone_number})`
                        }
                      </td>
                      <td className="py-4 font-mono font-bold text-slate-400">{tx.amount.toFixed(2)}</td>
                      <td className="py-4 font-mono font-bold text-slate-200">{tx.net_amount.toFixed(2)}</td>
                      <td className="py-4">
                        {tx.screenshot_url ? (
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
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center max-h-[60vh]">
              <img 
                src={selectedScreenshot} 
                alt="Reçu de transaction" 
                className="max-w-full max-h-[60vh] object-contain"
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
