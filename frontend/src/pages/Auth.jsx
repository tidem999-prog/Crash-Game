import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, Eye, EyeOff, Plane, Info } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [signupSuccessMessage, setSignupSuccessMessage] = useState('');

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSignupSuccessMessage('');
    
    if (!email || !password) {
      return setFormError('Veuillez remplir tous les champs.');
    }

    if (password.length < 6) {
      return setFormError('Le mot de passe doit faire au moins 6 caractères.');
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        navigate('/dashboard');
      } else {
        await signup(email, password);
        setSignupSuccessMessage("Votre compte a été créé ! Un email de simulation a été envoyé à votre console serveur. Vous êtes maintenant connecté.");
        // Redirect to dashboard after a short delay so they can read the message
        setTimeout(() => {
          navigate('/dashboard');
        }, 3000);
      }
    } catch (err) {
      setFormError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Background Orbs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full z-10">
        
        {/* Logo Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex bg-indigo-600 p-3 rounded-2xl text-white transform hover:rotate-12 transition-transform duration-300 shadow-lg shadow-indigo-500/20 mb-4">
            <Plane className="h-7 w-7 rotate-45" />
          </div>
          <h2 className="font-display font-black text-3xl tracking-tight text-white">
            {isLogin ? 'Bon retour parmi nous' : 'Rejoignez Crash Plane'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {isLogin ? 'Connectez-vous pour commencer à miser' : 'Créez votre portefeuille de jeu en HTG'}
          </p>
        </div>

        {/* Card Panel */}
        <div className="glass-panel p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          
          {/* Toggle Tabs */}
          <div className="flex border-b border-slate-800 mb-6">
            <button
              onClick={() => {
                setIsLogin(true);
                setFormError('');
                setSignupSuccessMessage('');
              }}
              className={`flex-1 pb-3 text-sm font-bold tracking-wide border-b-2 transition-all duration-300 ${
                isLogin ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Se Connecter
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setFormError('');
                setSignupSuccessMessage('');
              }}
              className={`flex-1 pb-3 text-sm font-bold tracking-wide border-b-2 transition-all duration-300 ${
                !isLogin ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              S'inscrire
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Errors */}
            {formError && (
              <div className="p-3.5 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-start space-x-2 animate-shake">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Success */}
            {signupSuccessMessage && (
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-start space-x-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{signupSuccessMessage}</span>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Adresse Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                  placeholder="nom@exemple.com"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/15 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>{isLogin ? 'Se connecter' : "S'inscrire"}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

          </form>

        </div>
      </div>
    </div>
  );
}
