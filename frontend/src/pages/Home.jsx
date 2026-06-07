import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Plane, Zap, Landmark, ArrowRight, ShieldCheck, TrendingUp } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="relative overflow-hidden flex flex-col justify-center items-center px-4 py-16 sm:px-6 lg:px-8 text-center flex-grow">
      
      {/* Background Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto z-10">
        
        {/* Animated Badge */}
        <div className="inline-flex items-center space-x-2 bg-indigo-950/45 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-400 text-xs font-semibold mb-8 animate-pulse">
          <Zap className="h-3 w-3" />
          <span>Le jeu de crash numéro 1 en Haïti</span>
        </div>

        {/* Hero Headline */}
        <h1 className="font-display font-black text-5xl sm:text-7xl tracking-tight text-white mb-6 leading-tight">
          Multipliez vos mises jusqu'à <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">100x en direct</span>
        </h1>

        <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Déposez par <span className="text-white font-semibold">MonCash</span> ou <span className="text-white font-semibold">NatCash</span>, placez vos paris, observez l'avion monter et encaissez vos HTG avant le crash fatidique !
        </p>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            to={user ? "/dashboard" : "/auth"}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
          >
            <span>{user ? "Accéder au Tableau de Jeu" : "Jouer Maintenant"}</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
          {!user && (
            <Link
              to="/auth"
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-8 py-4 rounded-xl border border-slate-800 transition-all duration-200"
            >
              Créer un compte
            </Link>
          )}
        </div>

        {/* Features Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          
          {/* Card 1 */}
          <div className="glass-panel p-6 rounded-2xl hover:border-indigo-500/30 transition-all duration-300">
            <div className="h-10 w-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 mb-4">
              <TrendingUp className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Multiplicateur en Temps Réel</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Grâce aux WebSockets, suivez le vol de l'avion en direct à la milliseconde près avec d'autres centaines de joueurs simultanément.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-panel p-6 rounded-2xl hover:border-indigo-500/30 transition-all duration-300">
            <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 mb-4">
              <Landmark className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Paiements Haïtiens Intégrés</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Effectuez vos dépôts de manière sécurisée via MonCash ou NatCash. Envoyez votre reçu et commencez à jouer dès sa validation rapide.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-panel p-6 rounded-2xl hover:border-indigo-500/30 transition-all duration-300">
            <div className="h-10 w-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 mb-4">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-200 mb-2">Algorithme Équitable</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Un avantage de la maison (House Edge) fixé à 5% et un plafond de sécurité de 100.00x pour garantir un jeu équitable et équilibré.
            </p>
          </div>

        </div>

      </div>
      
      {/* Decorative Plane flying */}
      <div className="absolute right-[-100px] top-10 text-slate-900/15 pointer-events-none select-none text-[300px] font-bold rotate-12">
        ✈️
      </div>

    </div>
  );
}
