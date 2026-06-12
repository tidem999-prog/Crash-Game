import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiRequest } from '../context/AuthContext';
import { CheckCircle, XCircle, Loader2, Gamepad2 } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Le token de confirmation est manquant ou invalide.');
      return;
    }

    const verifyToken = async () => {
      try {
        const data = await apiRequest('/api/auth/verify-email', {
          method: 'POST',
          body: { token }
        });
        setStatus('success');
        setMessage(data.message);
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Le lien de confirmation est invalide ou expiré.');
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-panel p-8 rounded-3xl border border-slate-900 bg-slate-900/40 text-center relative overflow-hidden shadow-2xl">
        
        {/* Glow effect */}
        <div className="absolute -top-10 -left-10 h-32 w-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -right-10 h-32 w-32 bg-purple-500/10 rounded-full blur-3xl"></div>

        {/* Logo */}
        <div className="flex flex-col items-center justify-center space-y-2 mb-6">
          <div className="bg-gradient-to-tr from-yellow-500 to-indigo-600 p-3 rounded-2xl text-white transform hover:rotate-12 transition-transform duration-300 shadow-lg shadow-indigo-500/20 mb-2">
            <Gamepad2 className="h-6 w-6" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-white mt-2">
            KET<span className="text-indigo-500">ARENA</span>
          </span>
        </div>

        {status === 'verifying' && (
          <div className="space-y-6 py-6">
            <Loader2 className="h-12 w-12 text-indigo-500 animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-slate-200">Vérification de votre compte</h2>
            <p className="text-sm text-slate-400">Veuillez patienter pendant que nous vérifions vos informations...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 py-6">
            <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-display font-black text-white">Compte Confirmé !</h2>
            <p className="text-sm text-slate-300 px-2">{message}</p>
            <div className="pt-4">
              <Link
                to="/auth"
                className="w-full inline-block py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-indigo-500/20"
              >
                Se Connecter
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 py-6">
            <div className="bg-red-500/10 text-red-400 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto border border-red-500/20">
              <XCircle className="h-10 w-10 animate-pulse" />
            </div>
            <h2 className="text-2xl font-display font-black text-white">Échec de Confirmation</h2>
            <p className="text-sm text-slate-300 px-2">{message}</p>
            <div className="pt-4 flex flex-col space-y-2">
              <Link
                to="/auth"
                className="w-full inline-block py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-200"
              >
                Retourner à la Connexion
              </Link>
              <Link
                to="/"
                className="text-xs text-slate-500 hover:text-slate-400 transition-colors py-2"
              >
                Retour à l'accueil
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
