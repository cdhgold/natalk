/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'natalk-bg': '#ABC1D1',
        'natalk-yellow': '#FEE500',
      }
    },
  },
  plugins: [],
}