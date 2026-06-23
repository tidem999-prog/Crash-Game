import React, { useState, useEffect } from 'react';
import { apiRequest } from '../context/AuthContext';
import { Play, Film, AlertTriangle, Eye, Video } from 'lucide-react';

export default function VideosTab({ addNotification }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null); // stores video object to play in modal

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/videos');
      setVideos(data);
    } catch (err) {
      console.error('Error fetching videos:', err);
      if (addNotification) {
        addNotification('Impossible de charger les vidéos tutoriels.', 'danger');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const getYouTubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getEmbedUrl = (video) => {
    if (video.type === 'youtube') {
      const ytId = getYouTubeId(video.url);
      if (ytId) {
        return `https://www.youtube.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0`;
      }
      return video.url;
    }
    // For local files, resolve relative api path
    const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
    return video.url.startsWith('http') ? video.url : `${backendUrl}${video.url}`;
  };

  const getThumbnail = (video) => {
    if (video.type === 'youtube') {
      const ytId = getYouTubeId(video.url);
      if (ytId) {
        return `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
      }
    }
    // Return a default placeholder with video details or generic image
    return 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop';
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      
      {/* Title Panel */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900/40 via-rose-950/5 to-slate-900/40 border border-slate-800 shadow-xl relative overflow-hidden text-center md:text-left">
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-black text-2xl text-white flex items-center justify-center md:justify-start space-x-2">
              <Video className="h-6 w-6 text-rose-450" />
              <span>Tutoriels Vidéos</span>
            </h3>
            <p className="text-sm text-slate-400 mt-1">Découvrez comment jouer, effectuer vos dépôts et retraits en toute sécurité sur Ketarena.</p>
          </div>
          <span className="text-[10px] uppercase font-black tracking-widest text-rose-400 bg-rose-950/40 border border-rose-900/40 px-3 py-1.5 rounded-full">
            {videos.length} Vidéos disponible{videos.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center bg-transparent">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-500 border-t-transparent"></div>
        </div>
      ) : videos.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800 space-y-3">
          <Film className="h-10 w-10 text-slate-600 mx-auto" />
          <h4 className="font-bold text-slate-350">Aucun tutoriel disponible</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">L'administration n'a pas encore ajouté de vidéos tutoriels. Revenez plus tard pour en savoir plus sur la plateforme.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {videos.map((video) => (
            <div 
              key={video.id}
              onClick={() => setActiveVideo(video)}
              className="group cursor-pointer glass-panel rounded-2xl overflow-hidden border border-slate-800/80 hover:border-rose-500/40 bg-slate-900/20 hover:bg-slate-900/40 transition-all duration-300 shadow-md flex flex-col justify-between"
            >
              {/* Thumbnail with aspect 9/16 for vertical screen layout */}
              <div className="relative aspect-[9/16] bg-slate-950 w-full overflow-hidden flex items-center justify-center">
                <img 
                  src={getThumbnail(video)} 
                  alt={video.title} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-90"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop';
                  }}
                />
                <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/30 transition-colors flex items-center justify-center">
                  <div className="h-12 w-12 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 transform group-hover:scale-110 transition-transform duration-300">
                    <Play className="h-5 w-5 fill-current ml-0.5" />
                  </div>
                </div>
                {video.type === 'youtube' && (
                  <span className="absolute top-2.5 right-2.5 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded border border-red-500/20 shadow-md">
                    YouTube
                  </span>
                )}
              </div>

              {/* Info panel */}
              <div className="p-3.5 border-t border-slate-850 bg-slate-950/40">
                <h4 className="font-bold text-slate-200 text-xs line-clamp-2 min-h-[32px] group-hover:text-white transition-colors">
                  {video.title}
                </h4>
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-[9px] text-slate-500 font-mono">
                    {new Date(video.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  <span className="text-[9px] text-rose-450 hover:underline font-bold flex items-center space-x-0.5">
                    <span>Regarder</span>
                    <Eye className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Modal Player (Vertical aspect optimised 9:16) */}
      {activeVideo && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="bg-slate-900/60 border border-slate-850 p-4 sm:p-5 rounded-3xl max-w-sm w-full relative flex flex-col justify-between animate-scale-up shadow-2xl">
            <button
              onClick={() => setActiveVideo(null)}
              className="absolute -top-3 -right-3 text-slate-400 hover:text-white text-xs font-bold p-2 bg-slate-900 border border-slate-800 rounded-full h-8 w-8 flex items-center justify-center transition-colors shadow-lg cursor-pointer z-50"
            >
              ✕
            </button>
            <h4 className="font-display font-black text-sm text-white mb-3 text-center line-clamp-1 pr-6 uppercase tracking-wide">
              {activeVideo.title}
            </h4>
            
            {/* Player Container in 9:16 aspect ratio */}
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[9/16] w-full relative shadow-inner">
              {activeVideo.type === 'youtube' ? (
                <iframe
                  src={getEmbedUrl(activeVideo)}
                  title={activeVideo.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                ></iframe>
              ) : (
                <video
                  src={getEmbedUrl(activeVideo)}
                  controls
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                ></video>
              )}
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-3 font-semibold">Tutoriel Ketarena • Aspect 9:16</p>
          </div>
        </div>
      )}

    </div>
  );
}
