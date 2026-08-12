/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ledger: {
          bg: '#F7F7F5',
          surface: '#FFFFFF',
          border: '#E7E5E0',
          ink: '#1A1D1F',
          muted: '#6B7280',
          accent: '#2451B0',
          'accent-hover': '#1D3F8F',
          success: '#1A7F4E',
          warning: '#B5730A',
          error: '#B0261E',
          'row-hover': '#FAFAF9',
        },
        primary: {
          50: '#EEF4FF',
          100: '#DDE8FF',
          200: '#BED1FF',
          300: '#91AEFA',
          400: '#5E80E8',
          500: '#3A63CD',
          600: '#2451B0',
          700: '#1D3F8F',
          800: '#1C3472',
          900: '#1D315D',
          950: '#14203C',
        },
        accent: {
          50: '#EEF4FF',
          100: '#DDE8FF',
          200: '#BED1FF',
          300: '#91AEFA',
          400: '#5E80E8',
          500: '#3A63CD',
          600: '#2451B0',
          700: '#1D3F8F',
          800: '#1C3472',
          900: '#1D315D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: 'none',
        card: 'none',
        lift: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      },
      borderRadius: {
        xl: '8px',
        '2xl': '8px',
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
