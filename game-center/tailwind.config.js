/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'flap': 'flap 0.2s infinite',
        'float': 'float 2s ease-in-out infinite',
      },
      keyframes: {
        flap: {
          '0%, 100%': { transform: 'rotate(0deg) scaleY(1)' },
          '50%': { transform: 'rotate(-30deg) scaleY(0.7)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}