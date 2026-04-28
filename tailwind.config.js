/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'deep-blue': '#022549',
        'vibrant-orange': '#FC5923',
        'slate-grey': '#394A53',
        'page': '#F8FAFC',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(180deg, #ff6b3d 0%, #FC5923 100%)',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(2, 37, 73, 0.08)',
        'card-hover': '0 8px 30px rgba(2, 37, 73, 0.12)',
        'cta': '0 4px 14px rgba(252, 89, 35, 0.4)',
        'xl': '0 20px 25px -5px rgba(2, 37, 73, 0.08), 0 8px 10px -6px rgba(2, 37, 73, 0.05)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'marquee': 'marquee 15s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
         marquee: {
    '0%': { transform: 'translateX(100%)' },
    '100%': { transform: 'translateX(-100%)' },
      },
    },
  },
},
  plugins: [],
}

