/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Support manual toggling or via system
  theme: {
    extend: {
      colors: {
        // Warm Alabaster & Espresso-Obsidian Backgrounds (zero blue cast)
        bg: {
          light: '#FAF8F5',
          lightAlt: '#F3EFE8',
          dark: '#110E0C',
          darkAlt: '#1B1714',
        },
        // Primary — Rich Terracotta & Spiced Ember
        primary: {
          50: '#fff5f0',
          100: '#ffe6d9',
          200: '#fecab0',
          300: '#fda47d',
          400: '#fb7747',
          500: '#ea580c',
          600: '#c2410c',
          700: '#9a3412',
          800: '#7c2d12',
          900: '#652510',
          950: '#361105',
        },
        // Accents (zero blue)
        purple: {
          light: '#f7a8cc',
          DEFAULT: '#be185d',
          dark: '#831843',
        },
        cyan: {
          light: '#fde047',
          DEFAULT: '#eab308',
          dark: '#a16207',
        },
        emerald: {
          light: '#34d399',
          DEFAULT: '#10b981',
          dark: '#047857',
        },
        orange: {
          light: '#fb923c',
          DEFAULT: '#ea580c',
          dark: '#9a3412',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 4px 6px -1px rgba(25, 22, 19, 0.05), 0 2px 4px -1px rgba(25, 22, 19, 0.03)',
        'premium-hover': '0 10px 15px -3px rgba(25, 22, 19, 0.1), 0 4px 6px -2px rgba(25, 22, 19, 0.05)',
        'glow': '0 0 18px rgba(194, 65, 12, 0.45)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        }
      }
    },
  },
  plugins: [],
}
