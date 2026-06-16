import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Gamepad2, Zap, Landmark, ArrowRight, ShieldCheck, Trophy, Users, Activity, Plane, Bomb, Crown } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col w-full relative overflow-hidden">
      
      {/* Background Gradients */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-20 left-10 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Hero Section */}
      <section className="relative flex flex-col justify-center items-center px-4 pt-24 pb-16 text-center max-w-4xl mx-auto z-10 w-full">
        {/* Animated Badge */}
        <div className="inline-flex items-center space-x-2 bg-indigo-950/45 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-400 text-xs font-semibold mb-8 animate-pulse">
          <Zap className="h-3 w-3" />
          <span>La plateforme de jeux multijoueurs #1 en Haïti</span>
        </div>

        {/* Hero Headline */}
        <h1 className="font-display font-black text-5xl sm:text-7xl tracking-tight text-white mb-6 leading-tight">
          Jouez et multipliez vos <span className="bg-gradient-to-r from-yellow-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">HTG en direct</span>
        </h1>

        <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Déposez par <span className="text-white font-semibold">MonCash</span> ou <span className="text-white font-semibold">NatCash</span>, affrontez les joueurs sur <span className="text-yellow-400 font-semibold">KetMesye (Snake)</span> ou volez avec <span className="text-indigo-400 font-semibold">Crash Plane</span> pour faire de gros bénéfices !
        </p>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 w-full max-w-md mx-auto">
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
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-8 py-4 rounded-xl border border-slate-800 transition-all duration-200"
            >
              Créer un compte
            </Link>
          )}
        </div>
      </section>

      {/* Decorative Game Icon floating */}
      <div className="absolute right-[-80px] top-10 text-slate-900/10 pointer-events-none select-none text-[300px] font-bold rotate-12 z-0">
        🎮
      </div>

      {/* Statistics Section */}
      <section className="relative max-w-5xl mx-auto px-4 py-12 z-10 w-full border-t border-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {/* Stat 1 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center">
            <Users className="h-8 w-8 text-indigo-400 mb-2" />
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">2 500+</span>
            <span className="text-slate-400 text-sm mt-1">Joueurs Inscrits</span>
          </div>
          {/* Stat 2 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center">
            <Landmark className="h-8 w-8 text-emerald-400 mb-2" />
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">520 372 HTG</span>
            <span className="text-slate-400 text-sm mt-1">Total des Retraits Payés</span>
          </div>
          {/* Stat 3 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-center items-center relative">
            <div className="relative">
              <Activity className="h-8 w-8 text-yellow-500 mb-2 animate-pulse" />
              <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-slate-950 animate-ping"></span>
            </div>
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">140+</span>
            <span className="text-slate-400 text-sm mt-1">Joueurs en Ligne</span>
          </div>
        </div>
      </section>

      {/* Our Games Grid Section */}
      <section className="relative max-w-5xl mx-auto px-4 py-16 z-10 w-full border-t border-slate-900">
        <h2 className="font-display font-black text-3xl text-center text-white mb-10">
          Explorez les Jeux de l'Arena
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Game 1: Crash Plane */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-indigo-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="h-10 w-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 mb-4">
                <Plane className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Crash Plane</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Suivez le vol de l'avion et observez le multiplicateur monter. Sécurisez vos gains avant le crash !
              </p>
            </div>
            <span className="text-indigo-400 text-xs font-semibold uppercase tracking-wider">Multiplicateur exponentiel</span>
          </div>

          {/* Game 2: KetMesye Arena (Snake) */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-yellow-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="h-10 w-10 bg-yellow-500/10 rounded-lg flex items-center justify-center text-yellow-500 mb-4">
                <Gamepad2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">KetMesye (Snake)</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Affrontez d'autres joueurs en direct. Éliminez les serpents adverses pour récupérer leurs gains !
              </p>
            </div>
            <span className="text-yellow-500 text-xs font-semibold uppercase tracking-wider">Multijoueur en temps réel</span>
          </div>

          {/* Game 3: Mines */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-emerald-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400 mb-4">
                <Bomb className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">Mines</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Définissez le nombre de mines. Découvrez les étoiles cachées sans exploser pour multiplier votre mise.
              </p>
            </div>
            <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Jeu de hasard & réflexion</span>
          </div>

          {/* Game 4: King of the Hill */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/10 hover:border-purple-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="h-10 w-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 mb-4">
                <Crown className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-200 mb-2">King of the Hill</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                Dominez l'arène pour devenir le roi de la colline et rafler le multiplicateur du pot global !
              </p>
            </div>
            <span className="text-purple-400 text-xs font-semibold uppercase tracking-wider">Bataille de multiplicateurs</span>
          </div>
        </div>
      </section>

      {/* Testimonials Section in Creole */}
      <section className="relative max-w-5xl mx-auto px-4 py-16 z-10 w-full border-t border-slate-900">
        <h2 className="font-display font-black text-3xl text-center text-white mb-4">
          Sa Jwè yo ap Di sou Ketarena
        </h2>
        <p className="text-slate-400 text-center text-sm max-w-lg mx-auto mb-12">
          Eksperyans jwè nou yo k ap fè benefis chak jou nan Arena a.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Testimonial 1 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
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
              <div className="text-xs text-indigo-400 mt-0.5">Jwè aktif</div>
            </div>
          </div>

          {/* Testimonial 2 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
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
              <div className="text-xs text-indigo-400 mt-0.5">Jwè depi 3 mwa</div>
            </div>
          </div>

          {/* Testimonial 3 */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/10 hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
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
              <div className="text-xs text-indigo-400 mt-0.5">Jwè pwofesyonèl</div>
            </div>
          </div>
        </div>
      </section>

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
        <div className="max-w-5xl mx-auto border-t border-slate-900 mt-8 pt-8 text-center text-xs text-slate-600">
          <p>© {new Date().getFullYear()} Ketarena. Tous droits réservés.</p>
        </div>
      </footer>

    </div>
  );
}
