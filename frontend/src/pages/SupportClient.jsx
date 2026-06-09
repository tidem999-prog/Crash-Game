import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminChat from '../components/AdminChat';

const SupportClient = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 w-full flex-grow flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Link to="/admin" className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-3xl font-display font-black text-white">
              Support <span className="text-purple-500">Client</span>
            </h1>
          </div>
          <p className="text-slate-400">Gérez les conversations en temps réel avec vos utilisateurs.</p>
        </div>
      </div>

      {/* Chat Section */}
      <div className="flex-grow flex flex-col min-h-[600px] mb-8">
        <AdminChat />
      </div>
    </div>
  );
};

export default SupportClient;
