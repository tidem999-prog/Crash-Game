/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Chakra Petch"', 'sans-serif'],
        display: ['"Russo One"', 'sans-serif'],
      },
      colors: {
        brand: {
          dark: '#0F0F23',      // Deep slate/purple
          card: '#0f172a',      // Slate-900 (keeping this as a fallback if needed)
          accent: '#F43F5E',    // Rose/Neon
          primary: '#7C3AED',   // Violet électrique
          secondary: '#A78BFA', // Violet clair
          border: '#4C1D95',    // Violet profond
          danger: '#EF4444',    // Red-500
          success: '#10b981',   // Emerald-500
          warning: '#f59e0b',   // Amber-500
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-plane': 'floatPlane 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'radar-ping': 'radarPing 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 5px rgba(99, 102, 241, 0.5))' },
          '50%': { opacity: '0.7', filter: 'drop-shadow(0 0 15px rgba(99, 102, 241, 0.8))' },
        },
        floatPlane: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-10px) rotate(2deg)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '10%': { opacity: '0.5' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        radarPing: {
          '75%, 100%': { transform: 'scale(2.5)', opacity: '0' }
        }
      }
    },
  },
  plugins: [],
}
