import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Coins, Award, Gem, Lock, Unlock, Sparkles, CheckCircle, RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import { apiRequest } from '../context/AuthContext';

const Competitions = ({ onNotificationAdded }) => {
  const [activeSubTab, setActiveSubTab] = useState('leaderboards'); // 'leaderboards', 'battle', 'chests', 'history'
  const [leaderboardType, setLeaderboardType] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [competitions, setCompetitions] = useState([]);
  const [chests, setChests] = useState([]);
  const [historyData, setHistoryData] = useState({ history: [], winnings: [] });
  const [loading, setLoading] = useState(false);
  const [openingChestId, setOpeningChestId] = useState(null);
  const [chestAnimationState, setChestAnimationState] = useState(''); // '', 'shake', 'open', 'reveal'
  const [openedReward, setOpenedReward] = useState(null); // { type, value, message }
  const [timeRemaining, setTimeRemaining] = useState({});

  const addNotification = (msg, type = 'info') => {
    if (onNotificationAdded) {
      onNotificationAdded(msg, type);
    }
  };

  const fetchActiveCompetitions = async () => {
    try {
      const data = await apiRequest('/api/competitions/active');
      if (Array.isArray(data)) {
        setCompetitions(data);
      }
    } catch (err) {
      console.error('Error loading active competitions:', err);
    }
  };

  const fetchChests = async () => {
    try {
      const data = await apiRequest('/api/competitions/chests');
      if (Array.isArray(data)) {
        setChests(data);
      }
    } catch (err) {
      console.error('Error loading chests:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await apiRequest('/api/competitions/history');
      if (data && data.history) {
        setHistoryData(data);
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchActiveCompetitions(),
      fetchChests(),
      fetchHistory()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Countdown timer effect
  useEffect(() => {
    const updateCountdowns = () => {
      const remaining = {};
      competitions.forEach(comp => {
        const diff = new Date(comp.end_time) - new Date();
        if (diff <= 0) {
          remaining[comp.id] = "Terminé. En attente de résolution...";
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          
          if (days > 0) {
            remaining[comp.id] = `${days}j ${hours}h ${mins}m`;
          } else {
            remaining[comp.id] = `${hours}h ${mins}m ${secs}s`;
          }
        }
      });
      setTimeRemaining(remaining);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
  }, [competitions]);

  const handleOpenChest = async (chestId) => {
    if (openingChestId) return; // Prevent double click
    setOpeningChestId(chestId);
    setChestAnimationState('shake');
    setOpenedReward(null);

    // Shake for 1.2s, then transition to open
    setTimeout(() => {
      setChestAnimationState('open');
    }, 1200);

    try {
      const data = await apiRequest(`/api/competitions/chests/${chestId}/open`, { method: 'POST' });
      if (data.error) {
        addNotification(data.error, 'danger');
        setOpeningChestId(null);
        setChestAnimationState('');
        return;
      }

      setTimeout(() => {
        setOpenedReward(data);
        setChestAnimationState('reveal');
        addNotification(data.message, 'success');
        fetchChests(); // refresh list
      }, 2000);

    } catch (err) {
      console.error('Error opening chest:', err);
      addNotification("Erreur lors de l'ouverture du coffre.", 'danger');
      setOpeningChestId(null);
      setChestAnimationState('');
    }
  };

  const closeRewardModal = () => {
    setOpeningChestId(null);
    setChestAnimationState('');
    setOpenedReward(null);
  };

  const activeLeaderboard = competitions.find(
    c => c.type === (activeSubTab === 'battle' ? 'xp_battle' : leaderboardType)
  );

  const getRankBadgeStyle = (rank) => {
    if (rank === 1) return 'bg-amber-500/20 border-amber-500 text-amber-300';
    if (rank === 2) return 'bg-slate-300/20 border-slate-300 text-slate-200';
    if (rank === 3) return 'bg-amber-700/20 border-amber-700 text-amber-600';
    return 'bg-slate-800/40 border-slate-700 text-slate-400';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 w-full flex-grow flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="text-yellow-500 animate-pulse shrink-0" size={36} />
            <h1 className="text-3xl sm:text-4xl font-display font-black text-white leading-tight">
              Centre de <span className="text-purple-500">Compétitions</span>
            </h1>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">Compétez pour des prize pools réels et ouvrez des coffres légendaires basés sur votre XP.</p>
        </div>
        <button 
          onClick={loadAllData} 
          disabled={loading}
          className="flex items-center gap-2 self-start md:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold rounded-lg border border-slate-750 transition-colors shadow-lg hover:shadow-purple-500/5 disabled:opacity-5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-slate-800 mb-6 overflow-x-auto scrollbar-none gap-2">
        <button
          onClick={() => setActiveSubTab('leaderboards')}
          className={`px-3 sm:px-6 py-2 sm:py-3 font-display font-black text-sm sm:text-lg transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
            activeSubTab === 'leaderboards' 
              ? 'border-purple-500 text-purple-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award size={18} />
          Leaderboards XP
        </button>
        <button
          onClick={() => setActiveSubTab('battle')}
          className={`px-3 sm:px-6 py-2 sm:py-3 font-display font-black text-sm sm:text-lg transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
            activeSubTab === 'battle' 
              ? 'border-purple-500 text-purple-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gem size={18} />
          XP Battle (Volume)
        </button>
        <button
          onClick={() => setActiveSubTab('chests')}
          className={`px-3 sm:px-6 py-2 sm:py-3 font-display font-black text-sm sm:text-lg transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
            activeSubTab === 'chests' 
              ? 'border-purple-500 text-purple-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles size={18} />
          Lucky XP Chests
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`px-3 sm:px-6 py-2 sm:py-3 font-display font-black text-sm sm:text-lg transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
            activeSubTab === 'history' 
              ? 'border-purple-500 text-purple-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins size={18} />
          Historique & Gains
        </button>
      </div>

      {/* LEADERBOARDS & BATTLE TABS */}
      {(activeSubTab === 'leaderboards' || activeSubTab === 'battle') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Details & Standings */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            
            {/* Leaderboard sub-navigation if leaderboards */}
            {activeSubTab === 'leaderboards' && (
              <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 border border-slate-800 flex gap-1.5 sm:gap-2">
                {['daily', 'weekly', 'monthly'].map(type => (
                  <button
                    key={type}
                    onClick={() => setLeaderboardType(type)}
                    className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-black capitalize transition-all ${
                      leaderboardType === type
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    {type === 'daily' ? 'Journalier' : type === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}
                  </button>
                ))}
              </div>
            )}

            {/* Competition Card Info */}
            <div className="bg-gradient-to-br from-slate-900/80 to-purple-950/10 backdrop-blur-md rounded-3xl p-4 sm:p-6 border border-slate-800 flex flex-col gap-4 sm:gap-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl" />
              
              <div>
                <span className="px-3 py-1 bg-purple-500/10 text-purple-300 text-xs font-black rounded-full border border-purple-500/20 uppercase tracking-widest">
                  {activeSubTab === 'battle' ? 'Volume des Mises' : `${leaderboardType} XP`}
                </span>
                <h2 className="text-xl sm:text-2xl font-display font-black text-white mt-3">
                  {activeSubTab === 'battle' ? 'XP Battle Arena' : `Leaderboard ${leaderboardType === 'daily' ? 'Journalier' : leaderboardType === 'weekly' ? 'Hebdomadaire' : 'Mensuel'}`}
                </h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  {activeSubTab === 'battle' 
                    ? 'Cumulez le volume de mises le plus élevé en HTG sur la période.' 
                    : 'Gagnez un maximum de points XP en plaçant des mises réelles en HTG.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-slate-950/40 rounded-2xl p-3 sm:p-4 border border-slate-850">
                  <div className="text-slate-500 text-[10px] sm:text-xs flex items-center gap-1.5">
                    <Coins size={14} className="text-purple-400" />
                    Cagnotte Globale
                  </div>
                  <div className="text-base sm:text-xl font-display font-black text-white mt-1">
                    {activeLeaderboard ? `${activeLeaderboard.prize_pool.toLocaleString('fr-FR')} HTG` : '-- HTG'}
                  </div>
                </div>
                <div className="bg-slate-950/40 rounded-2xl p-3 sm:p-4 border border-slate-850">
                  <div className="text-slate-500 text-[10px] sm:text-xs flex items-center gap-1.5">
                    <Clock size={14} className="text-purple-400" />
                    Temps Restant
                  </div>
                  <div className="text-base sm:text-xl font-display font-black text-white mt-1 tracking-tight">
                    {activeLeaderboard ? timeRemaining[activeLeaderboard.id] || 'Calcul...' : '--'}
                  </div>
                </div>
              </div>

              {/* Connected User standing */}
              {activeLeaderboard && activeLeaderboard.userStanding && (
                <div className="bg-slate-950/60 rounded-2xl p-4 sm:p-5 border border-purple-500/25 shadow-lg shadow-purple-500/5 flex flex-col gap-2.5 sm:gap-3">
                  <h3 className="text-[10px] sm:text-xs font-black text-purple-400 uppercase tracking-wider">Votre Statut</h3>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs sm:text-sm">Votre Position</span>
                    <span className="text-base sm:text-lg font-black text-white">
                      {activeLeaderboard.userStanding.rank ? `#${activeLeaderboard.userStanding.rank}` : 'Non Classé'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs sm:text-sm">Votre Score</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      {activeLeaderboard.userStanding.score.toLocaleString('fr-FR')} {activeSubTab === 'battle' ? 'HTG' : 'XP'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-850">
                    <span className="text-slate-400 text-xs sm:text-sm">Gain Estimé</span>
                    <span className="text-base sm:text-lg font-display font-black text-green-400">
                      {activeLeaderboard.userStanding.estimatedPayout.toLocaleString('fr-FR')} HTG
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Rules Alert Box */}
            <div className="bg-slate-900/40 rounded-2xl p-5 border border-slate-800 text-slate-400 text-xs leading-relaxed flex items-start gap-3">
              <AlertCircle className="text-purple-400 shrink-0 mt-0.5" size={18} />
              <div>
                <span className="font-bold text-slate-200 block mb-1">Règles & Protection Économique</span>
                Les cagnottes sont calculées en direct sur les commissions réelles HTG collectées. Les wagers en monnaie virtuelle KET ne modifient pas la cagnotte ni le classement. Les gains finaux sont directement crédités sur votre balance.
              </div>
            </div>

          </div>

          {/* Right Column: Leaderboard Podium and List */}
          <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
            {activeLeaderboard && activeLeaderboard.leaderboard && activeLeaderboard.leaderboard.length > 0 ? (
              <>
                {/* Visual Podium for top 3 */}
                <div className="flex justify-center items-end gap-2.5 sm:gap-6 py-6 border-b border-slate-850 overflow-hidden">
                  
                  {/* Rank 2 */}
                  {activeLeaderboard.leaderboard[1] && (
                    <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px] sm:max-w-[130px] animate-fade-in">
                      <div className="relative mb-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-300 flex items-center justify-center font-bold text-slate-200 text-sm sm:text-lg bg-slate-900 bg-gradient-to-br from-slate-700/20 to-slate-900 shadow-lg">
                          2
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-400 font-bold w-full truncate text-center mb-1">
                        {activeLeaderboard.leaderboard[1].username}
                      </span>
                      <span className="text-[10px] sm:text-xs font-black text-slate-300 bg-slate-800/60 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-750 truncate max-w-full">
                        {activeLeaderboard.leaderboard[1].score.toLocaleString('fr-FR')}
                      </span>
                      <div className="h-16 sm:h-20 w-full bg-slate-700/25 border-t border-slate-650 rounded-t-xl mt-3 flex items-center justify-center font-display font-black text-slate-400 text-xs sm:text-sm">
                        2nd
                      </div>
                    </div>
                  )}

                  {/* Rank 1 */}
                  {activeLeaderboard.leaderboard[0] && (
                    <div className="flex flex-col items-center flex-1 min-w-0 max-w-[120px] sm:max-w-[150px] animate-fade-in">
                      <div className="relative mb-2">
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xl sm:text-2xl text-yellow-500 animate-bounce">👑</div>
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 sm:border-4 border-amber-500 flex items-center justify-center font-bold text-amber-300 text-base sm:text-2xl bg-slate-900 bg-gradient-to-br from-amber-500/20 to-slate-900 shadow-lg shadow-amber-500/10">
                          1
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm text-slate-200 font-black w-full truncate text-center mb-1">
                        {activeLeaderboard.leaderboard[0].username}
                      </span>
                      <span className="text-[10px] sm:text-xs font-black text-amber-300 bg-amber-550/15 px-2 py-0.5 rounded-full border border-amber-500/30 shadow-lg shadow-amber-500/5 truncate max-w-full">
                        {activeLeaderboard.leaderboard[0].score.toLocaleString('fr-FR')}
                      </span>
                      <div className="h-20 sm:h-28 w-full bg-amber-500/15 border-t-2 border-amber-550 rounded-t-2xl mt-3 flex items-center justify-center font-display font-black text-amber-300 text-sm sm:text-base shadow-inner">
                        King
                      </div>
                    </div>
                  )}

                  {/* Rank 3 */}
                  {activeLeaderboard.leaderboard[2] && (
                    <div className="flex flex-col items-center flex-1 min-w-0 max-w-[110px] sm:max-w-[130px] animate-fade-in">
                      <div className="relative mb-2">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-amber-700 flex items-center justify-center font-bold text-amber-600 text-sm sm:text-lg bg-slate-900 bg-gradient-to-br from-amber-800/20 to-slate-900 shadow-lg">
                          3
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-400 font-bold w-full truncate text-center mb-1">
                        {activeLeaderboard.leaderboard[2].username}
                      </span>
                      <span className="text-[10px] sm:text-xs font-black text-amber-600 bg-slate-800/60 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-750 truncate max-w-full">
                        {activeLeaderboard.leaderboard[2].score.toLocaleString('fr-FR')}
                      </span>
                      <div className="h-12 sm:h-16 w-full bg-amber-700/20 border-t border-amber-750 rounded-t-xl mt-3 flex items-center justify-center font-display font-black text-amber-750 text-[10px] sm:text-xs">
                        3rd
                      </div>
                    </div>
                  )}

                </div>

                {/* Table of subsequent positions */}
                <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                  {activeLeaderboard.leaderboard.slice(3).map(player => (
                    <div 
                      key={player.user_id}
                      className="bg-slate-950/30 rounded-xl p-3 border border-slate-850 hover:bg-slate-800/20 transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-900 flex items-center justify-center font-bold text-slate-300 text-xs">
                          {player.rank}
                        </span>
                        <span className="text-slate-200 text-sm font-bold">{player.username}</span>
                      </div>
                      <span className="text-sm font-black text-slate-400">
                        {player.score.toLocaleString('fr-FR')} {activeSubTab === 'battle' ? 'HTG' : 'XP'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                <Trophy size={48} className="text-slate-700" />
                <div className="text-center">
                  <span className="font-bold block text-slate-400">Aucune activité enregistrée</span>
                  Soyez le premier à miser pour dominer ce classement !
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* LUCKY XP CHESTS TAB */}
      {activeSubTab === 'chests' && (
        <div className="flex flex-col gap-6">
          <div className="bg-slate-900/40 rounded-3xl p-6 border border-slate-850 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-display font-black text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" size={24} />
                Vos Coffres Récompenses
              </h2>
              <p className="text-slate-400 text-sm mt-1">Gagnez de l'XP en jouant aux jeux pour franchir des paliers et réclamer des Lucky XP Chests.</p>
            </div>
            <div className="flex items-center gap-3 bg-purple-650/15 border border-purple-500/30 px-5 py-3 rounded-2xl shadow-lg shadow-purple-500/5 shrink-0">
              <Gem className="text-purple-400 animate-pulse" size={24} />
              <div>
                <span className="text-xs text-slate-400 block font-bold">Votre XP Global</span>
                <span className="text-xl font-display font-black text-purple-300">
                  {competitions.length > 0 && competitions[0].userStanding
                    ? competitions.find(c => c.type === 'daily')?.userStanding.score.toLocaleString('fr-FR') || '0.00'
                    : '0.00'} XP
                </span>
              </div>
            </div>
          </div>

          {/* Chests list grid */}
          {chests.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {chests.map(chest => {
                const isOpened = !!chest.opened_at;
                return (
                  <div 
                    key={chest.id}
                    className={`bg-slate-900/60 rounded-3xl border p-5 flex flex-col items-center justify-between gap-5 relative overflow-hidden transition-all shadow-lg ${
                      isOpened 
                        ? 'border-slate-850 opacity-60' 
                        : 'border-slate-800 hover:border-purple-500/40 hover:bg-slate-850/20 cursor-pointer shadow-purple-500/5'
                    }`}
                    onClick={() => !isOpened && handleOpenChest(chest.id)}
                  >
                    <div className="absolute top-3 right-3 text-xs font-black">
                      {isOpened ? (
                        <span className="text-green-500 flex items-center gap-1">
                          <CheckCircle size={14} />
                          Ouvert
                        </span>
                      ) : (
                        <span className="text-purple-400 flex items-center gap-1">
                          <Unlock size={14} />
                          Prêt
                        </span>
                      )}
                    </div>

                    <div className="mt-4 text-center">
                      <span className="text-xs font-black text-slate-500 block tracking-widest uppercase">Palier</span>
                      <span className="text-xl font-display font-black text-white">{chest.xp_milestone} XP</span>
                    </div>

                    {/* Animated chest box */}
                    <div className="relative w-28 h-28 my-2 flex items-center justify-center select-none">
                      {isOpened ? (
                        <div className="text-5xl">🔓🎁</div>
                      ) : (
                        <div className="text-5xl hover:scale-110 transition-transform">🔒📦</div>
                      )}
                    </div>

                    <div className="w-full">
                      {isOpened ? (
                        <div className="bg-slate-950/60 rounded-xl py-2 px-3 border border-slate-850 text-center">
                          <span className="text-[10px] text-slate-500 block font-bold">Gain Remporté</span>
                          <span className="text-sm font-black text-green-400">
                            {chest.reward_type === 'rare' 
                              ? chest.reward_value.name 
                              : `${parseFloat(chest.reward_value).toLocaleString('fr-FR')} ${chest.reward_type.toUpperCase()}`}
                          </span>
                        </div>
                      ) : (
                        <button className="w-full py-2.5 bg-purple-600 hover:bg-purple-550 text-white font-black text-sm rounded-xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-1.5">
                          <Sparkles size={16} />
                          Ouvrir le coffre
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900/20 rounded-3xl border border-slate-800 p-16 flex flex-col items-center justify-center text-slate-500 gap-3">
              <Sparkles size={48} className="text-slate-700 animate-pulse" />
              <div className="text-center max-w-sm">
                <span className="font-bold text-slate-400 block text-lg mb-1">Aucun coffre débloqué</span>
                Continuez à jouer pour accumuler de l'XP. Vous débloquez votre premier coffre à <strong className="text-purple-400">100 XP</strong> !
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORIQUE & GAINS TAB */}
      {activeSubTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Claims / Winnings Ledger */}
          <div className="lg:col-span-1 bg-slate-900/30 border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
            <h3 className="text-xl font-display font-black text-white flex items-center gap-2">
              <Coins className="text-purple-400" size={20} />
              Grand Livre des Gains
            </h3>

            {historyData.winnings && historyData.winnings.length > 0 ? (
              <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                {historyData.winnings.map((win, i) => (
                  <div 
                    key={i}
                    className="bg-slate-950/40 rounded-xl p-3 border border-slate-850 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs text-slate-500 block font-bold uppercase tracking-wider">
                        {win.provider === 'competition' ? 'Compétition' : 'Lucky Chest'}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">
                        {new Date(win.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-base font-display font-black text-green-400">
                      +{win.amount.toLocaleString('fr-FR')} HTG
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-16 text-slate-650 text-xs">
                Aucun gain de compétition enregistré pour le moment.
              </div>
            )}
          </div>

          {/* Right Column: Historical Competitions list */}
          <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
            <h3 className="text-xl font-display font-black text-white flex items-center gap-2">
              <Trophy className="text-purple-400" size={20} />
              Compétitions Précédentes
            </h3>

            {historyData.history && historyData.history.length > 0 ? (
              <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-1">
                {historyData.history.map(comp => (
                  <div 
                    key={comp.id}
                    className="bg-slate-950/30 rounded-2xl p-4 border border-slate-850 flex flex-col gap-3 hover:border-slate-750 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-black text-purple-400 uppercase tracking-widest capitalize">
                          {comp.type === 'xp_battle' ? 'XP Battle' : `${comp.type}`}
                        </span>
                        <span className="text-xs text-slate-500 block mt-0.5">
                          Terminé le {new Date(comp.end_time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                        </span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl text-xs font-black text-slate-300">
                        Prize Pool: {comp.prize_pool.toLocaleString('fr-FR')} HTG
                      </div>
                    </div>

                    {/* Winners summary */}
                    <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-850 flex flex-wrap gap-2 items-center">
                      <span className="text-slate-500 text-xs font-bold mr-1">Podium:</span>
                      {comp.winners.slice(0, 3).map((w, index) => (
                        <span key={index} className="text-xs font-black text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          🏆 {w.username} ({w.prize.toFixed(0)} HTG)
                        </span>
                      ))}
                      {comp.winners.length > 3 && (
                        <span className="text-xs font-bold text-slate-500">
                          +{comp.winners.length - 3} autres
                        </span>
                      )}
                    </div>

                    {/* Did connected user win? */}
                    {comp.userWin && (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl py-2 px-3 text-xs font-black text-green-400 flex items-center justify-between">
                        <span>Félicitations ! Vous avez terminé au rang #{comp.userWin.rank} !</span>
                        <span>+{comp.userWin.prize.toLocaleString('fr-FR')} HTG</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                <Clock size={36} className="text-slate-700" />
                <span>Aucune compétition résolue disponible dans l'historique.</span>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ANIME CHEST OPENING MODAL */}
      {openingChestId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-950/60 rounded-3xl p-8 border border-purple-550/30 max-w-sm w-full flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
            
            {/* Modal Glow effect */}
            <div className="absolute inset-0 bg-radial-gradient from-purple-500/10 to-transparent pointer-events-none" />

            <h3 className="text-xl font-display font-black text-white mb-6">
              Ouverture du coffre...
            </h3>

            {/* Shaking & opening animation container */}
            <div className="relative w-36 h-36 flex items-center justify-center my-6">
              {chestAnimationState === 'shake' && (
                <div className="text-7xl animate-bounce">📦⚡</div>
              )}
              {chestAnimationState === 'open' && (
                <div className="text-7xl animate-ping">🎁✨</div>
              )}
              {chestAnimationState === 'reveal' && openedReward && (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-7xl animate-fade-in">🎉</div>
                  
                  <div className="mt-4">
                    <span className="text-xs font-black text-purple-400 uppercase tracking-widest block">Vous avez gagné</span>
                    <span className="text-3xl font-display font-black text-green-400 mt-2 block animate-pulse">
                      {openedReward.reward_type === 'rare' 
                        ? openedReward.reward_value.name 
                        : `${parseFloat(openedReward.reward_value).toLocaleString('fr-FR')} ${openedReward.reward_type.toUpperCase()}`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {chestAnimationState === 'reveal' && openedReward ? (
              <button 
                onClick={closeRewardModal}
                className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-550 text-white font-black rounded-xl shadow-lg shadow-purple-500/20 hover:shadow-purple-500/35 transition-all"
              >
                Super !
              </button>
            ) : (
              <p className="text-slate-400 text-sm mt-4 animate-pulse">
                Le tirage aléatoire est en cours. Veuillez patienter...
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default Competitions;
