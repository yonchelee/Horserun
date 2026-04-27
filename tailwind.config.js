/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          50: '#f5f5f7',
          100: '#e8e8ed',
          200: '#d2d2d7',
          400: '#86868b',
          600: '#3a3a3c',
          900: '#1d1d1f',
        },
      },
      keyframes: {
        sweat: {
          '0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.8' },
          '50%': { transform: 'translateY(8px) scale(0.7)', opacity: '0' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.6)' },
          '100%': { boxShadow: '0 0 0 16px rgba(244,63,94,0)' },
        },
        gallop: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2px)' },
        },
      },
      animation: {
        sweat: 'sweat 0.9s ease-in-out infinite',
        pulseRing: 'pulseRing 1.4s cubic-bezier(0.4,0,0.6,1) infinite',
        gallop: 'gallop 0.18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
