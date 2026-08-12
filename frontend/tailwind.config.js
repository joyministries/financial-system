/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Lambton ink — the letterhead's black text, scaled for UI roles
        primary: {
          50: '#f6f6f7',
          100: '#e8e8ea',
          200: '#d2d2d7',
          300: '#acadb5',
          400: '#82838d',
          500: '#5c5d66',
          600: '#43444c',
          700: '#333438',
          800: '#232326',
          900: '#1c1c1f',
          950: '#0f0f11',
        },
        // Lambton gold — from the school crest
        accent: {
          50: '#fdf9ec',
          100: '#f9efcc',
          200: '#f2df9a',
          300: '#e9c766',
          400: '#dfb445',
          500: '#c9a227',
          600: '#a9851b',
          700: '#8a6d16',
          800: '#6b5413',
          900: '#554211',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Letterhead display face (Trebuchet MS) for brand headings
        display: ['"Trebuchet MS"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.04), 0 4px 16px -4px rgba(16,24,40,0.08)',
        card: '0 1px 3px rgba(16,24,40,0.06), 0 12px 32px -12px rgba(16,24,40,0.14)',
        lift: '0 2px 4px rgba(16,24,40,0.06), 0 16px 40px -12px rgba(16,24,40,0.18)',
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
