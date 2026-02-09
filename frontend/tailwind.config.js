/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff9e5',
          100: '#ffefbf',
          200: '#ffe08a',
          300: '#f5cf5a',
          400: '#e6bd3b',
          500: '#d4af37',
          600: '#b9922d',
          700: '#9b7b25',
          800: '#7c621f',
          900: '#5e4a17',
        }
      }
    },
  },
  plugins: [],
}
