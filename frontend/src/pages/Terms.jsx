import React from 'react';
import { ArrowLeft, Shield, AlertTriangle, FileText, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center text-indigo-400 hover:text-indigo-300 transition-colors">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Retour à l'accueil
          </Link>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-5xl font-display font-black text-white mb-4">
              Conditions et <span className="text-indigo-500">Politiques</span>
            </h1>
            <p className="text-slate-400">Dernière mise à jour : Juin 2026</p>
          </div>

          <div className="space-y-12">
            {/* Section 1: CGU */}
            <section>
              <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                <FileText className="h-8 w-8 text-indigo-400" />
                <h2 className="text-2xl font-bold text-white">1. Conditions Générales d’Utilisation (CGU)</h2>
              </div>
              <div className="space-y-6 text-slate-400 leading-relaxed pl-2 sm:pl-11">
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Préambule</h3>
                  <p>En accédant et en utilisant la plateforme KetArena, vous acceptez sans réserve les présentes conditions générales. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser nos services.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Admissibilité</h3>
                  <p>L'utilisateur doit avoir atteint l'âge légal de la majorité dans sa juridiction (18 ans ou plus). Il est strictement interdit aux mineurs d'accéder à la plateforme.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Comptes Utilisateurs</h3>
                  <p>Chaque utilisateur ne peut détenir qu'un seul compte. L'utilisateur est responsable de la sécurité de ses identifiants de connexion. Toute activité effectuée via votre compte est réputée avoir été réalisée par vous.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Dépôts et Retraits</h3>
                  <p>Les transactions sont traitées selon les méthodes locales disponibles sur la plateforme.</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300">
                    <li><strong>Retraits :</strong> Les demandes de retrait sont traitées manuellement par notre équipe administrative dans un délai de 24 à 48 heures.</li>
                    <li>KetArena se réserve le droit de vérifier l'identité de l'utilisateur avant de valider un retrait.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Jeu Responsable</h3>
                  <p>Les jeux de hasard comportent des risques de perte financière. Vous jouez à vos propres risques. Nous encourageons nos utilisateurs à définir des limites de dépôt et à jouer de manière responsable.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-400 mb-2">Droit de suspension</h3>
                  <p className="text-slate-300">KetArena se réserve le droit de suspendre, de geler ou de fermer tout compte utilisateur soupçonné d'utiliser des logiciels automatisés (bots), des techniques de piratage, ou de profiter de failles techniques (bugs) pour manipuler les résultats des jeux. Dans de tels cas, les gains obtenus de manière frauduleuse seront annulés.</p>
                </div>
              </div>
            </section>

            {/* Section 2: Privacy */}
            <section>
              <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                <Lock className="h-8 w-8 text-emerald-400" />
                <h2 className="text-2xl font-bold text-white">2. Politique de Confidentialité (Résumé)</h2>
              </div>
              <div className="space-y-6 text-slate-400 leading-relaxed pl-2 sm:pl-11">
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Collecte de Données</h3>
                  <p>Nous collectons des informations nécessaires à la gestion de votre compte (Nom, email, numéro de téléphone, historique des transactions). Ces données sont utilisées uniquement pour assurer le bon fonctionnement de la plateforme et pour des mesures de sécurité.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Sécurité</h3>
                  <p>Nous mettons en œuvre des mesures techniques pour protéger vos données contre tout accès non autorisé. Vos données personnelles ne seront jamais vendues à des tiers.</p>
                </div>
              </div>
            </section>

            {/* Section 3: Disclaimer */}
            <section>
              <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                <Shield className="h-8 w-8 text-yellow-400" />
                <h2 className="text-2xl font-bold text-white">3. Clause de Non-Responsabilité (Disclaimer)</h2>
              </div>
              <div className="space-y-6 text-slate-400 leading-relaxed pl-2 sm:pl-11">
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Logiciel</h3>
                  <p>KetArena fournit ses services "en l'état". Bien que nous fassions tout pour assurer une expérience fluide, nous ne garantissons pas une disponibilité ininterrompue de la plateforme.</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Risques</h3>
                  <p>KetArena ne peut être tenu responsable des pertes financières subies par l'utilisateur lors de l'utilisation des jeux (Crash, Snake, etc.).</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Modification</h3>
                  <p>Nous nous réservons le droit de modifier ces conditions à tout moment. Les utilisateurs seront informés des changements majeurs.</p>
                </div>
                <div className="bg-slate-950/50 border border-yellow-500/20 p-6 rounded-2xl mt-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <AlertTriangle className="h-24 w-24 text-yellow-500" />
                  </div>
                  <h3 className="text-lg font-bold text-yellow-500 mb-3 relative z-10 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Limites de Gains et Paiements
                  </h3>
                  <p className="text-slate-300 relative z-10 italic">
                    "Afin d'assurer la pérennité et la stabilité de la plateforme, KetArena se réserve le droit d'appliquer un plafond de gains maximum par session ou par jour pour chaque utilisateur. 
                    Dans le cas où un gain exceptionnel dépasserait les réserves de liquidités immédiatement disponibles sur la plateforme, KetArena se réserve le droit de procéder au paiement de ce gain de manière fractionnée sur une période déterminée, ou de limiter le paiement au solde de réserve actuel de la plateforme, sans que la responsabilité de KetArena ne puisse être engagée au-delà de ces capacités opérationnelles."
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
