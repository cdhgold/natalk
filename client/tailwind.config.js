/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
    "./public/intro.html",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#1111d4",
        "background-light": "#f6f6f8",
        "background-dark": "#101022",
        "surface-dark": "#1c1c2e",
      },
      fontFamily: {
        "display": ["Manrope", "Noto Sans KR", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}