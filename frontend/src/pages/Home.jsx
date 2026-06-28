import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Gamepad2, Zap, Landmark, ArrowRight, ShieldCheck, Trophy, Users, Activity, Plane, Bomb, Crown, Coins, Flame, Clock, Gem } from 'lucide-react';
import { motion } from 'framer-motion';

// --- ANIMATION VARIANTS ---
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

// --- 3D HERO ANIMATIONS COMPONENT ---
const Hero3DAnimations = () => {
  return (
    <div className="relative w-full lg:w-[500px] h-[500px] pointer-events-none z-0 perspective-1000 mt-10 lg:mt-0 flex-shrink-0">
      
      {/* 3D Crash Plane (taking off from bottom left to top right) */}
      <motion.div
        animate={{
          x: [0, 300, 350],
          y: [400, 50, 0],
          rotate: [-15, -25, 10],
          scale: [0.6, 1.2, 0]
        }}
        transition={{
          duration: 4.5,
          repeat: Infinity,
          ease: "easeIn"
        }}
        className="absolute bottom-0 left-0 flex flex-col items-center drop-shadow-[0_0_20px_rgba(99,102,241,0.8)]"
      >
        <Plane className="w-20 h-20 text-indigo-400 rotate-45" fill="currentColor" />
        {/* Multiplier */}
        <div className="absolute top-16 bg-slate-900/80 px-2 py-1 rounded border border-slate-700 text-[10px] font-mono text-indigo-300 font-bold">
           <motion.span animate={{ opacity: [1, 1, 0] }} transition={{ duration: 4.5, repeat: Infinity }}>
             2.50x
           </motion.span>
        </div>
        
        {/* Explosion Effect at the end */}
        <motion.div
           animate={{ opacity: [0, 0, 1, 0], scale: [0, 0, 4, 0] }}
           transition={{ duration: 4.5, repeat: Infinity, ease: "easeOut" }}
           className="absolute -top-10 -right-10 w-32 h-32 bg-red-600 rounded-full blur-xl z-10"
        />
        <motion.div
           animate={{ opacity: [0, 0, 1, 0], scale: [0, 0, 2, 0] }}
           transition={{ duration: 4.5, repeat: Infinity, ease: "easeOut" }}
           className="absolute -top-5 -right-5 w-20 h-20 bg-yellow-400 rounded-full blur-lg z-20"
        />
      </motion.div>

      {/* Snake Animation (slithering on the bottom right) */}
      <motion.div
        animate={{
          x: [150, 30, 150],
          y: [350, 330, 350],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-0 left-0"
      >
        {/* Snake Name Tag */}
        <div className="absolute top-[0px] left-24 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded text-[9px] flex flex-col items-center shadow-lg">
           <span className="text-white font-bold tracking-wider">haiticashpam</span>
           <span className="text-yellow-400 font-mono font-bold">104.40 G</span>
        </div>

        {/* Snake Body (SVG) */}
        <svg width="220" height="80" viewBox="0 0 220 80" className="drop-shadow-[0_0_12px_rgba(253,224,71,0.6)] mt-8">
           <circle cx="180" cy="40" r="14" fill="#d8b4fe" />
           <circle cx="160" cy="40" r="14" fill="#c084fc" />
           <circle cx="140" cy="40" r="14" fill="#a855f7" />
           <circle cx="120" cy="40" r="14" fill="#9333ea" />
           {/* Head */}
           <circle cx="200" cy="40" r="16" fill="#e9d5ff" />
           {/* Eyes */}
           <circle cx="205" cy="34" r="3" fill="#0f172a" />
           <circle cx="205" cy="46" r="3" fill="#0f172a" />
           {/* White/Orange dots inside body like the screenshot */}
           <circle cx="120" cy="40" r="4" fill="#f97316" />
           <circle cx="140" cy="40" r="4" fill="#ffffff" />
           <circle cx="160" cy="40" r="4" fill="#f97316" />
           <circle cx="180" cy="40" r="4" fill="#ffffff" />
        </svg>
      </motion.div>

      {/* 3D KET & HTG Coins being chased by Snake */}
      <motion.div
        animate={{ y: [0, -10, 0], rotateY: [0, 360] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-24 right-10 w-14 h-14 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 border-4 border-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.6)] flex items-center justify-center"
      >
        <span className="text-yellow-900 font-black text-xs">KET</span>
      </motion.div>

      <motion.div
        animate={{ y: [0, 10, 0], rotateY: [360, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-36 right-32 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 border-4 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] flex items-center justify-center"
      >
        <span className="text-emerald-950 font-black text-[10px]">HTG</span>
      </motion.div>

    </div>
  );
};

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col w-full relative overflow-hidden">
      
      {/* Background Gradients */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-20 left-10 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Hero Section */}
      <motion.section 
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative flex flex-col lg:flex-row justify-between items-center px-4 pt-24 pb-16 max-w-6xl mx-auto z-10 w-full"
      >
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full lg:w-1/2">
          {/* Animated Badge */}
          <motion.div variants={fadeInUp} className="inline-flex items-center space-x-2 bg-indigo-950/45 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-400 text-xs font-semibold mb-8 animate-pulse">
            <Zap className="h-3 w-3" />
            <span>La plateforme de jeux multijoueurs #1 en Haïti</span>
          </motion.div>

          {/* Hero Headline */}
          <motion.h1 variants={fadeInUp} className="font-display font-black text-5xl sm:text-7xl tracking-tight text-white mb-6 leading-tight">
            Jouez et multipliez vos <br className="hidden lg:block"/><span className="bg-gradient-to-r from-yellow-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">HTG en direct</span>
          </motion.h1>

          <motion.p variants={fadeInUp} className="text-slate-400 text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed">
            Déposez par <span className="text-white font-semibold">MonCash</span> ou <span className="text-white font-semibold">NatCash</span>, affrontez les joueurs sur <span className="text-yellow-400 font-semibold">KetMesye (Snake)</span> ou pariez sur <span className="text-emerald-400 font-semibold">Last Second</span> pour faire de gros bénéfices !
          </motion.p>

          {/* Action Button */}
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <Link
              to={user ? "/dashboard" : "/auth"}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
            >
              <span>{user ? "Accéder à l'Arena" : "Jouer Maintenant"}</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
            {!user && (
              <Link
                to="/auth"
                className="w-full sm:w-auto flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-8 py-4 rounded-xl border border-slate-800 transition-all duration-200"
              >
                Créer un compte
              </Link>
            )}
          </motion.div>
        </div>

        {/* 3D Animations Right Side */}
        <Hero3DAnimations />
      </motion.section>

      {/* Statistics Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-12 z-10 w-full border-t border-slate-900"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {/* Stat 1 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center">
            <Users className="h-8 w-8 text-indigo-400 mb-2" />
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">2 500+</span>
            <span className="text-slate-400 text-sm mt-1">Joueurs Inscrits</span>
          </motion.div>
          {/* Stat 2 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center">
            <Landmark className="h-8 w-8 text-emerald-400 mb-2" />
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">520 372 HTG</span>
            <span className="text-slate-400 text-sm mt-1">Total des Retraits Payés</span>
          </motion.div>
          {/* Stat 3 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center relative">
            <div className="relative">
              <Activity className="h-8 w-8 text-yellow-500 mb-2 animate-pulse" />
              <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-slate-950 animate-ping"></span>
            </div>
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">140+</span>
            <span className="text-slate-400 text-sm mt-1">Joueurs en Ligne</span>
          </motion.div>
        </div>
      </motion.section>

      {/* Our Games Grid Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-16 z-10 w-full border-t border-slate-900"
      >
        <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display font-black text-3xl text-white tracking-wide uppercase">
            Explorez les Jeux de l'Arena
          </h2>
          <p className="text-slate-400 text-xs mt-2 uppercase tracking-wider font-semibold">
            8 Jeux exclusifs multijoueurs et solos pour parier et multiplier vos HTG en direct
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Game 1: Crash Plane */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-indigo-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/crash_plane.png" alt="Crash Plane" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 mb-4 border border-indigo-500/15">
                <Plane className="h-5 w-5 rotate-45" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Crash Plane</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Suivez le vol de l'avion et observez le multiplicateur monter. Sécurisez vos gains avant le crash !
              </p>
            </div>
            <span className="relative z-10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">Multiplicateur exponentiel</span>
          </motion.div>

          {/* Game 2: KetMesye Arena (Snake) */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-yellow-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/ketmesye_snake.png" alt="KetMesye Snake" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-yellow-500/10 rounded-lg flex items-center justify-center text-yellow-500 mb-4 border border-yellow-500/15">
                <Gamepad2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">KetMesye (Snake)</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Affrontez d'autres joueurs en direct. Éliminez les serpents adverses pour récupérer leurs gains !
              </p>
            </div>
            <span className="relative z-10 text-yellow-500 text-[10px] font-bold uppercase tracking-wider">Multijoueur en temps réel</span>
          </motion.div>

          {/* Game 3: Mines */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/mines_game.png" alt="Mines Game" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400 mb-4 border border-cyan-500/15">
                <Gem className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Mines</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Définissez le nombre de mines. Découvrez les étoiles cachées sans exploser pour multiplier votre mise.
              </p>
            </div>
            <span className="relative z-10 text-cyan-400 text-[10px] font-bold uppercase tracking-wider">Jeu de hasard & réflexion</span>
          </motion.div>

          {/* Game 4: King of the Hill */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-purple-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/koth_crown.png" alt="KOTH Crown" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 mb-4 border border-purple-500/15">
                <Crown className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">King of the Hill</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Dominez l'arène pour devenir le roi de la colline et rafler le multiplicateur du pot global !
              </p>
            </div>
            <span className="relative z-10 text-purple-400 text-[10px] font-bold uppercase tracking-wider">Bataille de multiplicateurs</span>
          </motion.div>

          {/* Game 5: Blood Money */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-red-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/blood_money.png" alt="Blood Money" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-red-500/10 rounded-lg flex items-center justify-center text-red-400 mb-4 border border-red-500/15">
                <Flame className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Blood Money</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Échappez à la police dans cette course intense ! Choisissez votre route et encaissez avant l'arrestation.
              </p>
            </div>
            <span className="relative z-10 text-red-400 text-[10px] font-bold uppercase tracking-wider">Crash Urbain Tactique</span>
          </motion.div>

          {/* Game 6: Last Second */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-emerald-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/last_second.png" alt="Last Second" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 mb-4 border border-emerald-500/15">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Last Second</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Pariez en direct sur des actions de match réelles ! Encaissez avant le but ou tenez bon sans but.
              </p>
            </div>
            <span className="relative z-10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">Live Football Simulator</span>
          </motion.div>

          {/* Game 7: Duel Snake */}
          <motion.div variants={tiltCard} whileHover="hover" initial="rest" className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-pink-500/40 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
            <img src="/games/duel_snake.png" alt="Duel Snake" className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none group-hover:opacity-60 transition-opacity duration-300 z-0" />
            <div className="relative z-10">
              <div className="h-10 w-10 bg-pink-500/10 rounded-lg flex items-center justify-center text-pink-400 mb-4 border border-pink-500/15">
                <Crown className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Duel Snake</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-4">
                Défiez un adversaire en face-à-face dans un duel de serpent serré. Le vainqueur remporte 90% du pot global.
              </p>
            </div>
            <span className="relative z-10 text-pink-400 text-[10px] font-bold uppercase tracking-wider">1v1 PvP Compétitif</span>
          </motion.div>
        </div>
      </motion.section>

      {/* Rewards, Levels & KET Loyalty Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-16 z-10 w-full border-t border-slate-900"
      >
        <motion.div variants={fadeInUp} className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 bg-pink-950/45 border border-pink-500/25 px-3 py-1 rounded-full text-pink-400 text-xs font-semibold mb-4 animate-pulse">
            <Coins className="h-3 w-3" />
            <span>Fidélité Récompensée & Progression</span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight">
            Niveaux, Récompenses et Jetons <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">KET</span>
          </h2>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Chaque action dans l'arène vous rapproche du rang supérieur et génère des jetons de fidélité KET (10 HTG misés = 100 KET gagnés).
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Niveaux */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-300"></div>
            <div className="h-10 w-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 mb-4 border border-indigo-500/20">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Progression de Niveaux</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-4">
              Gagnez de l'XP à chaque mise. Montez les échelons du niveau 1 (Bronze) jusqu'au niveau 5 (Diamant) pour déverrouiller des plafonds de retrait plus élevés et des multiplicateurs boostés.
            </p>
            {/* Simulated progress bar */}
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-850 mt-4">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: "66%" }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="bg-indigo-500 h-full rounded-full" 
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
              <span>Niveau 3 (Or)</span>
              <span>65% XP</span>
            </div>
          </motion.div>

          {/* Card 2: Jetons KET */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-pink-500/30 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-pink-500/10 transition-all duration-300"></div>
            <div className="h-10 w-10 bg-pink-500/10 rounded-lg flex items-center justify-center text-pink-400 mb-4 border border-pink-500/20">
              <Coins className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Jetons Fidélité KET</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-4">
              Recevez des jetons KET gratuits pour chaque jeu joué, qu'il soit gagnant ou perdant (10 HTG misés = 100 KET). Vos jetons s'accumulent de manière sécurisée dans votre coffre.
            </p>
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-[10px] text-pink-400 font-mono flex items-center space-x-1.5 mt-4">
              <Coins className="h-3.5 w-3.5" />
              <span>Votre coffre génère des jetons à chaque seconde !</span>
            </div>
          </motion.div>

          {/* Card 3: Conversion */}
          <motion.div variants={fadeInUp} whileHover={{ y: -8 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-300"></div>
            <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 mb-4 border border-emerald-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Conversion Instantanée</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-4">
              Pas de points virtuels inutiles ! Échangez instantanément vos jetons KET accumulés contre de l'argent réel sur votre solde principal. Le taux officiel est fixe : <strong>10 000 KET = 1 HTG</strong>.
            </p>
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-[11px] text-slate-400 font-semibold flex justify-between mt-4">
              <span>Taux d'échange :</span>
              <strong className="text-emerald-400 font-mono">10 000 KET ➔ 1 HTG</strong>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Testimonials Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="relative max-w-5xl mx-auto px-4 py-16 z-10 w-full border-t border-slate-900"
      >
        <motion.h2 variants={fadeInUp} className="font-display font-black text-3xl text-center text-white mb-4">
          Ce que disent nos joueurs sur Ketarena
        </motion.h2>
        <motion.p variants={fadeInUp} className="text-slate-400 text-center text-sm max-w-lg mx-auto mb-12">
          Découvrez les retours d'expérience de nos joueurs qui gagnent au quotidien dans l'arène.
        </motion.p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Testimonial 1 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1 text-yellow-500 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Trophy key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-slate-300 text-sm italic leading-relaxed mb-6">
                "Jwèt sa chanje jan m fè kòb sou entènèt la. Mwen fè depo m ak MonCash epi retrait mwen toujou vini rapid !"
              </p>
            </div>
            <div>
              <div className="font-bold text-sm text-white">Katalina L.</div>
              <div className="text-xs text-indigo-400 mt-0.5">Joueur actif</div>
            </div>
          </motion.div>

          {/* Testimonial 2 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1 text-yellow-500 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Trophy key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-slate-300 text-sm italic leading-relaxed mb-6">
                "Crash Plane lan dous anpil, depi w pa visye w ap fè kòb rapid chak jou. Rekòmande 100%."
              </p>
            </div>
            <div>
              <div className="font-bold text-sm text-white">Jean-Robert M.</div>
              <div className="text-xs text-indigo-400 mt-0.5">Joueur depuis 3 mois</div>
            </div>
          </motion.div>

          {/* Testimonial 3 */}
          <motion.div variants={fadeInUp} whileHover={{ y: -5 }} className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1 text-yellow-500 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Trophy key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-slate-300 text-sm italic leading-relaxed mb-6">
                "Depi lè m ap jwe Sepan Arena se la m pase tout tan m pou m touye lòt sepan epi pran kòb yo, jwèt sa pi dous"
              </p>
            </div>
            <div>
              <div className="font-bold text-sm text-white">Maken</div>
              <div className="text-xs text-indigo-400 mt-0.5">Joueur professionnel</div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Normal Footer */}
      <footer className="relative w-full border-t border-slate-900 bg-slate-950/60 px-4 py-12 z-10 mt-auto">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          {/* About Column */}
          <div>
            <span className="font-display font-black text-lg tracking-tight bg-gradient-to-r from-white to-indigo-400 bg-clip-text text-transparent uppercase">
              Ketarena
            </span>
            <p className="text-slate-500 text-sm mt-3 leading-relaxed">
              Ketarena se nimewo #1 platfòm jwèt multijoueurs an dirèk nan peyi Ayiti. Nou ofri yon sistèm rapid ak sekirize pou depo ak retrè avèk MonCash ak NatCash.
            </p>
          </div>

          {/* Quick Links Column */}
          <div>
            <h4 className="font-bold text-sm text-slate-300 uppercase tracking-wider mb-4">Liens Rapides</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={user ? "/dashboard" : "/auth"} className="text-slate-500 hover:text-indigo-400 transition-colors">
                  Arena de Jeux
                </Link>
              </li>
              <li>
                <Link to={user ? "/admin/support" : "/auth"} className="text-slate-500 hover:text-indigo-400 transition-colors">
                  Contacter le Support
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-slate-500 hover:text-indigo-400 transition-colors">
                  Conditions d'Utilisation
                </Link>
              </li>
            </ul>
          </div>

          {/* Social & Contact Column */}
          <div>
            <h4 className="font-bold text-sm text-slate-300 uppercase tracking-wider mb-4">Réseaux Sociaux</h4>
            <div className="flex flex-col space-y-3">
              <a
                href="https://whatsapp.com/channel/0029Vb59psgCnA7zPea8GT39"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-slate-500 hover:text-emerald-400 transition-colors text-sm group"
              >
                <span className="bg-emerald-500/10 p-2 rounded-lg group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </span>
                <span>Canal WhatsApp</span>
              </a>
              <a
                href="https://www.tiktok.com/@ketarena?_r=1&_t=ZS-97C95JlKF0f"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-slate-500 hover:text-indigo-400 transition-colors text-sm group"
              >
                <span className="bg-indigo-500/10 p-2 rounded-lg group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.53 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </span>
                <span>TikTok Ketarena</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
