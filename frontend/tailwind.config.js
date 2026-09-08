/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      colors: {
        cream: '#fdfaf6',
        clay: '#b5603f',
      },
      maxWidth: {
        settings: '640px',
      },
      keyframes: {
        'custom-bounce': {
          '0%, 100%': {
            transform: 'translateY(-2px)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
          },
          '50%': {
            transform: 'translateY(2px)',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          },
        },
      },
      animation: {
        'custom-bounce': 'custom-bounce 1s infinite',
      },
    },
  },
  plugins: [],
};
