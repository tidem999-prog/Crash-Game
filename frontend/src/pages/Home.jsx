import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Gamepad2, Zap, Landmark, ArrowRight, ShieldCheck, Trophy, Users, Activity, Plane, Bomb, Crown, Coins, Flame, Clock, Gem } from 'lucide-react';
import { motion } from 'framer-motion';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const tiltCard = {
  rest: { scale: 1, y: 0, rotateX: 0, rotateY: 0 },
  hover: { scale: 1.03, y: -8, transition: { type: "spring", stiffness: 300, damping: 20 } }
};

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-brand-dark text-slate-100 flex flex-col w-full relative overflow-hidden font-sans">
      
      {/* Background Gradients (Parallax/Glows) */}
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-primary/20 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/2 right-[-100px] w-[400px] h-[400px] bg-brand-accent/15 rounded-full blur-[100px] pointer-events-none"
      />
      <motion.div 
        animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.3, 0.2] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-[-50px] left-[-50px] w-[500px] h-[500px] bg-brand-secondary/15 rounded-full blur-[120px] pointer-events-none"
      />

      {/* Hero Section */}
      <motion.section 
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative flex flex-col justify-center items-center px-4 pt-32 pb-20 text-center max-w-5xl mx-auto z-10 w-full"
      >
        {/* Animated Badge */}
        <motion.div variants={fadeInUp} className="inline-flex items-center space-x-2 bg-brand-primary/10 border border-brand-primary/30 px-4 py-1.5 rounded-full text-brand-secondary text-xs font-bold mb-8 shadow-[0_0_15px_rgba(124,58,237,0.3)]">
          <Zap className="h-4 w-4 animate-pulse" />
          <span className="uppercase tracking-wider">La plateforme de jeux multijoueurs #1</span>
        </motion.div>

        {/* Hero Headline */}
        <motion.h1 variants={fadeInUp} className="font-display font-black text-5xl sm:text-7xl tracking-tight text-white mb-6 leading-tight drop-shadow-2xl">
          Jouez et multipliez vos <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-brand-accent via-brand-primary to-brand-secondary bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]">HTG en direct</span>
        </motion.h1>

        <motion.p variants={fadeInUp} className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
          Déposez par <span className="text-white font-bold drop-shadow-md">MonCash</span> ou <span className="text-white font-bold drop-shadow-md">NatCash</span>, affrontez les joueurs sur <span className="text-brand-accent font-bold">KetMesye</span> ou pariez sur <span className="text-emerald-400 font-bold">Last Second</span> pour faire de gros bénéfices !
        </motion.p>

        {/* Action Button */}
        <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-10 w-full max-w-lg mx-auto">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
            <Link
              to={user ? "/dashboard" : "/auth"}
              className="w-full flex items-center justify-center space-x-3 bg-brand-accent hover:bg-rose-500 text-white font-bold px-10 py-4 rounded-xl shadow-[0_0_30px_rgba(244,63,94,0.4)] hover:shadow-[0_0_45px_rgba(244,63,94,0.6)] transition-all duration-300"
            >
              <span className="font-display tracking-wide uppercase text-sm">{user ? "Accéder à l'Arena" : "Jouer Maintenant"}</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </motion.div>
          {!user && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full sm:w-auto">
              <Link
                to="/auth"
                className="w-full flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/80 text-slate-200 font-bold px-10 py-4 rounded-xl border border-brand-border/50 hover:border-brand-primary/50 transition-all duration-300 backdrop-blur-sm"
              >
                <span className="font-display tracking-wide uppercase text-sm">Créer un compte</span>
              </Link>
            </motion.div>
          )}
        </motion.div>
      </motion.section>

      {/* Statistics Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-12 z-10 w-full"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {/* Stat 1 */}
          <motion.div variants={fadeInUp} whileHover="hover" initial="rest" className="bg-slate-900/50 backdrop-blur-md p-8 rounded-2xl border border-brand-border/40 hover:border-brand-primary/60 transition-colors flex flex-col justify-center items-center shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Users className="h-10 w-10 text-brand-secondary mb-3 drop-shadow-[0_0_10px_rgba(167,139,250,0.5)]" />
            <span className="text-4xl font-black text-white font-display tracking-tight drop-shadow-md">2 500+</span>
            <span className="text-slate-400 text-sm mt-2 font-bold uppercase tracking-wider">Joueurs Inscrits</span>
          </motion.div>
          {/* Stat 2 */}
          <motion.div variants={fadeInUp} whileHover="hover" initial="rest" className="bg-slate-900/50 backdrop-blur-md p-8 rounded-2xl border border-brand-border/40 hover:border-emerald-500/50 transition-colors flex flex-col justify-center items-center shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Landmark className="h-10 w-10 text-emerald-400 mb-3 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            <span className="text-4xl font-black text-white font-display tracking-tight drop-shadow-md">520 372 HTG</span>
            <span className="text-slate-400 text-sm mt-2 font-bold uppercase tracking-wider">Retraits Payés</span>
          </motion.div>
          {/* Stat 3 */}
          <motion.div variants={fadeInUp} whileHover="hover" initial="rest" className="bg-slate-900/50 backdrop-blur-md p-8 rounded-2xl border border-brand-border/40 hover:border-brand-accent/50 transition-colors flex flex-col justify-center items-center shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative mb-3">
              <Activity className="h-10 w-10 text-brand-accent drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
              <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-brand-dark animate-ping"></span>
            </div>
            <span className="text-4xl font-black text-white font-display tracking-tight drop-shadow-md">140+</span>
            <span className="text-slate-400 text-sm mt-2 font-bold uppercase tracking-wider">En Ligne</span>
          </motion.div>
        </div>
      </motion.section>

      {/* Our Games Grid Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-6xl mx-auto px-4 py-20 z-10 w-full border-t border-brand-border/30"
      >
        <motion.div variants={fadeInUp} className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-display font-black text-4xl sm:text-5xl text-white tracking-wide uppercase drop-shadow-lg mb-4">
            L'Arena de Jeux
          </h2>
          <p className="text-brand-secondary text-sm sm:text-base uppercase tracking-[0.2em] font-bold">
            Pari en direct • Multijoueur • Gains exponentiels
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* Game 1: Crash Plane */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/crash_plane.png" alt="Crash Plane" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
              <div className="absolute top-4 right-4 z-20 bg-indigo-500/20 border border-indigo-500/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Populaire</span>
              </div>
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-indigo-400 mb-4 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                <Plane className="h-7 w-7 rotate-45" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">Crash Plane</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Suivez le vol de l'avion et encaissez avant le crash ! Le multiplicateur monte de façon exponentielle.
              </p>
            </div>
          </motion.div>

          {/* Game 2: KetMesye */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/ketmesye_snake.png" alt="KetMesye Snake" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
              <div className="absolute top-4 right-4 z-20 bg-brand-accent/20 border border-brand-accent/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
                <span className="text-[10px] font-black uppercase text-brand-accent tracking-wider">Multijoueur</span>
              </div>
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-brand-accent mb-4 border border-brand-accent/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <Gamepad2 className="h-7 w-7" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">KetMesye</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Affrontez d'autres joueurs en direct. Éliminez les serpents adverses pour récupérer leurs gains (HTG) !
              </p>
            </div>
          </motion.div>

          {/* Game 3: Last Second */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/last_second.png" alt="Last Second" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
              <div className="absolute top-4 right-4 z-20 bg-emerald-500/20 border border-emerald-500/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Live</span>
              </div>
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-emerald-400 mb-4 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Clock className="h-7 w-7" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">Last Second</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Pariez en direct sur des actions de match de foot réelles ! Encaissez avant le but pour tout rafler.
              </p>
            </div>
          </motion.div>

          {/* Game 4: Mines */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/mines_game.png" alt="Mines Game" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-cyan-400 mb-4 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                <Gem className="h-7 w-7" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">Mines</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Découvrez les étoiles cachées sans exploser pour multiplier votre mise. À vous de gérer le risque !
              </p>
            </div>
          </motion.div>

          {/* Game 5: Blood Money */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/blood_money.png" alt="Blood Money" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-red-500 mb-4 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <Flame className="h-7 w-7" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">Blood Money</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Échappez à la police dans cette course urbaine ! Choisissez votre route et encaissez avant l'arrestation.
              </p>
            </div>
          </motion.div>

          {/* Game 6: King of the Hill */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="bg-[#0f172a] rounded-2xl border border-brand-border/50 overflow-hidden group relative shadow-2xl">
            <div className="h-48 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent z-10" />
              <img src="/games/koth_crown.png" alt="KOTH" className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-110 transition-all duration-700 ease-out" />
            </div>
            <div className="p-6 relative z-20 -mt-10">
              <div className="h-14 w-14 bg-[#0f172a] rounded-xl flex items-center justify-center text-yellow-400 mb-4 border border-yellow-500/30 shadow-[0_0_15px_rgba(250,204,21,0.2)]">
                <Crown className="h-7 w-7" />
              </div>
              <h3 className="font-display font-black text-2xl text-white mb-2">King of the Hill</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Dominez l'arène pour devenir le roi de la colline et rafler le multiplicateur du pot global !
              </p>
            </div>
          </motion.div>

        </div>
      </motion.section>

      {/* Rewards, Levels & KET Loyalty Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-20 z-10 w-full border-t border-brand-border/30"
      >
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div variants={fadeInUp} className="inline-flex items-center space-x-2 bg-brand-primary/10 border border-brand-primary/30 px-4 py-1.5 rounded-full text-brand-secondary text-xs font-bold mb-4 shadow-[0_0_15px_rgba(124,58,237,0.2)]">
            <Coins className="h-4 w-4" />
            <span className="uppercase tracking-wider">Fidélité Récompensée</span>
          </motion.div>
          <motion.h2 variants={fadeInUp} className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight leading-tight drop-shadow-lg">
            Niveaux, Récompenses et <span className="bg-gradient-to-r from-brand-secondary to-brand-primary bg-clip-text text-transparent">Jetons KET</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1: Niveaux */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="bg-slate-900/60 backdrop-blur-md p-8 rounded-2xl border border-brand-border/50 hover:border-brand-primary/80 transition-all duration-300 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-brand-primary/20 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-primary/30 transition-colors"></div>
            <div className="h-14 w-14 bg-brand-dark rounded-xl flex items-center justify-center text-brand-secondary mb-6 border border-brand-primary/30 shadow-[0_0_15px_rgba(124,58,237,0.3)]">
              <Trophy className="h-7 w-7" />
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-3">Progression Elite</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Gagnez de l'XP à chaque mise. Montez les échelons du Bronze au Diamant pour déverrouiller des avantages exclusifs.
            </p>
            {/* Simulated progress bar */}
            <div className="w-full bg-brand-dark rounded-full h-3 overflow-hidden border border-brand-border/50">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: "65%" }}
                transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                className="bg-brand-primary h-full rounded-full shadow-[0_0_10px_rgba(124,58,237,0.8)]"
              />
            </div>
            <div className="flex justify-between text-xs text-brand-secondary mt-3 font-bold uppercase tracking-wider">
              <span>Niveau 3 (Or)</span>
              <span>65%</span>
            </div>
          </motion.div>

          {/* Card 2: Jetons KET */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="bg-slate-900/60 backdrop-blur-md p-8 rounded-2xl border border-brand-border/50 hover:border-brand-accent/80 transition-all duration-300 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-accent/30 transition-colors"></div>
            <div className="h-14 w-14 bg-brand-dark rounded-xl flex items-center justify-center text-brand-accent mb-6 border border-brand-accent/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
              <Coins className="h-7 w-7" />
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-3">Jetons Fidélité (KET)</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Gagnez des KET à chaque jeu joué (10 HTG misés = 100 KET). Votre coffre sécurisé génère des jetons en continu.
            </p>
            <div className="bg-brand-dark border border-brand-border/50 rounded-xl px-4 py-3 text-xs text-brand-accent font-bold uppercase tracking-wider flex items-center space-x-2">
              <Coins className="h-4 w-4 animate-bounce" />
              <span>Génération Automatique</span>
            </div>
          </motion.div>

          {/* Card 3: Conversion */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="bg-slate-900/60 backdrop-blur-md p-8 rounded-2xl border border-brand-border/50 hover:border-emerald-500/80 transition-all duration-300 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/30 transition-colors"></div>
            <div className="h-14 w-14 bg-brand-dark rounded-xl flex items-center justify-center text-emerald-400 mb-6 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Zap className="h-7 w-7" />
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-3">Conversion en Argent Réel</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Pas de points virtuels inutiles. Échangez instantanément vos jetons KET accumulés contre des vrais HTG !
            </p>
            <div className="bg-brand-dark border border-emerald-500/30 rounded-xl px-4 py-3 text-xs text-slate-300 font-bold flex justify-between items-center">
              <span className="uppercase tracking-wider">Taux :</span>
              <strong className="text-emerald-400 text-sm drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">10k KET = 1 HTG</strong>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="relative w-full border-t border-brand-border/50 bg-[#0F0F23] px-4 py-16 z-10 mt-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
          {/* About Column */}
          <div>
            <span className="font-display font-black text-2xl tracking-tight bg-gradient-to-r from-white to-brand-primary bg-clip-text text-transparent uppercase drop-shadow-md">
              Ketarena
            </span>
            <p className="text-slate-400 text-sm mt-4 leading-relaxed max-w-sm">
              La plateforme de jeux d'argent multijoueurs la plus avancée d'Haïti. Système ultra-rapide via MonCash et NatCash. Jouez, gagnez, encaissez.
            </p>
          </div>

          {/* Quick Links Column */}
          <div>
            <h4 className="font-display font-bold text-base text-white uppercase tracking-widest mb-6 border-b border-brand-border/30 pb-2 inline-block">Menu</h4>
            <ul className="space-y-3 text-sm font-bold tracking-wide">
              <li>
                <Link to={user ? "/dashboard" : "/auth"} className="text-slate-400 hover:text-brand-accent transition-colors flex items-center space-x-2">
                  <ArrowRight className="h-3 w-3" /> <span>Arena de Jeux</span>
                </Link>
              </li>
              <li>
                <Link to={user ? "/admin/support" : "/auth"} className="text-slate-400 hover:text-brand-accent transition-colors flex items-center space-x-2">
                  <ArrowRight className="h-3 w-3" /> <span>Contacter le Support</span>
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-slate-400 hover:text-brand-accent transition-colors flex items-center space-x-2">
                  <ArrowRight className="h-3 w-3" /> <span>Conditions d'Utilisation</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Social Column */}
          <div>
            <h4 className="font-display font-bold text-base text-white uppercase tracking-widest mb-6 border-b border-brand-border/30 pb-2 inline-block">Communauté</h4>
            <div className="flex flex-col space-y-4">
              <a
                href="https://whatsapp.com/channel/0029Vb59psgCnA7zPea8GT39"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-slate-400 hover:text-emerald-400 transition-colors text-sm font-bold uppercase tracking-wider group"
              >
                <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/30 group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <span>Canal WhatsApp</span>
              </a>
              <a
                href="https://www.tiktok.com/@ketarena?_r=1&_t=ZS-97C95JlKF0f"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-slate-400 hover:text-brand-primary transition-colors text-sm font-bold uppercase tracking-wider group"
              >
                <div className="bg-brand-primary/10 p-2.5 rounded-xl border border-brand-primary/30 group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(124,58,237,0.2)]">
                  <svg className="w-5 h-5 text-brand-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.53 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </div>
                <span>TikTok Ketarena</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
