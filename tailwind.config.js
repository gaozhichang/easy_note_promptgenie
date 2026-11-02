/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f3f1fe',
          100: '#e9e4fd',
          200: '#d5ccfb',
          300: '#b6a6f8',
          400: '#9580f4',
          500: '#6147e5',
          600: '#5139c4',
          700: '#452fa5',
          800: '#382786',
          900: '#30236f',
          950: '#1e1646',
        },
      },
    },
  },
  plugins: [],
};
