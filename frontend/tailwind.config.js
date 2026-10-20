/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Ledger palette — warm paper, ink, one gold that points. */
        ink: '#151517',
        body: '#3f4450',
        muted: '#6d7280',
        faint: '#9a958a',
        line: '#e7e3da',
        'line-soft': '#f0ece3',
        paper: '#faf9f5',
        panel: '#ffffff',

        navy: {
          DEFAULT: '#0f1b2b',
          50: '#f4f6f9',
          100: '#e6eaf0',
          200: '#cfd6e0',
          300: '#a7b2c2',
          400: '#77869a',
          500: '#54637a',
          600: '#3c4a5f',
          700: '#2b3748',
          800: '#1b2737',
          900: '#0f1b2b',
          950: '#0a131f',
        },

        gold: {
          DEFAULT: '#c9a227',
          50: '#fdf9ec',
          100: '#f9efcc',
          200: '#f2df9a',
          300: '#e0c465',
          400: '#d4b13c',
          500: '#c9a227',
          600: '#a9851b',
          700: '#8a6f13',
          800: '#6b5413',
          900: '#554211',
        },

        /* Brand action = ink. Kept as `primary` so existing markup keeps working. */
        primary: {
          50: '#f4f6f9',
          100: '#e6eaf0',
          200: '#cfd6e0',
          300: '#a7b2c2',
          400: '#77869a',
          500: '#54637a',
          600: '#3c4a5f',
          700: '#2b3748',
          800: '#1b2737',
          900: '#0f1b2b',
          950: '#0a131f',
        },

        /* School gold, unchanged name. */
        accent: {
          50: '#fdf9ec',
          100: '#f9efcc',
          200: '#f2df9a',
          300: '#e0c465',
          400: '#d4b13c',
          500: '#c9a227',
          600: '#a9851b',
          700: '#8a6f13',
          800: '#6b5413',
          900: '#554211',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        md: '7px',
        lg: '9px',
        xl: '12px',
        '2xl': '14px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(21,21,23,0.04)',
        card: '0 1px 2px rgba(21,21,23,0.05), 0 12px 28px -18px rgba(21,21,23,0.18)',
        lift: '0 18px 44px -16px rgba(21,21,23,0.28)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out both',
        'fade-up': 'fade-up 0.35s ease-out both',
        'modal-in': 'modal-in 0.18s ease-out both',
      },
    },
  },
  plugins: [],
}
