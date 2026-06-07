import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../context/AuthContext';
import { Mail, ArrowLeft, Loader2, Plane, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'submitting', 'success', 'error'
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setStatus('submitting');
    setError('');
    setMessage('');

    try {
      const data = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });
      setStatus('success');
      setMessage(data.message);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Une erreur est survenue. Veuillez réessayer.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-panel p-8 rounded-3xl border border-slate-900 bg-slate-900/40 relative overflow-hidden shadow-2xl">
        
        {/* Glow effect */}
        <div className="absolute -top-10 -left-10 h-32 w-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -right-10 h-32 w-32 bg-purple-500/10 rounded-full blur-3xl"></div>

        {/* Logo */}
        <div className="flex flex-col items-center justify-center space-y-2 mb-6">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white transform rotate-45 shadow-md shadow-indigo-500/20">
            <Plane className="h-6 w-6" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-white mt-2">
            CRASH<span className="text-indigo-500">PLANE</span>
          </span>
        </div>

        {status === 'success' ? (
          <div className="space-y-6 text-center py-4 animate-slide-up">
            <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-white">E-mail Envoyé</h3>
            <p className="text-sm text-slate-300 px-2 leading-relaxed">
              {message || "Si l'adresse correspond à un compte actif, un lien de réinitialisation de mot de passe a été envoyé."}
            </p>
            <div className="pt-4">
              <Link
                to="/auth"
                className="w-full inline-flex items-center justify-center py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retourner à la Connexion
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Mot de passe oublié ?</h3>
              <p className="text-xs text-slate-400 mt-1.5 px-4 leading-relaxed">
                Saisissez votre e-mail pour recevoir un lien de réinitialisation de votre mot de passe.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {status === 'error' && (
                <div className="p-3.5 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Adresse E-mail</label>
                <div className="relative rounded-xl overflow-hidden flex border border-slate-800 focus-within:border-indigo-500 transition-colors">
                  <div className="bg-slate-900 px-3.5 text-slate-500 flex items-center border-r border-slate-800">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    placeholder="exemple@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={status === 'submitting'}
                    className="block w-full px-4 py-3 bg-slate-950/70 text-slate-200 focus:outline-none text-sm font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={status === 'submitting' || !email}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Envoi en cours...</span>
                  </>
                ) : (
                  <span>Envoyer le Lien</span>
                )}
              </button>
            </form>

            <div className="text-center pt-2">
              <Link
                to="/auth"
                className="inline-flex items-center text-xs text-slate-500 hover:text-indigo-400 font-semibold transition-colors py-2"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Retour à la connexion
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
