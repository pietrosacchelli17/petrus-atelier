/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#F7F8F6',
          100: '#ECEFEB',
          200: '#DADFD7',
          300: '#BFC9BB',
          400: '#9DAB96',
          500: '#7A8E71',
          600: '#7D8C74',
          700: '#6B7C63',
          800: '#5A6B52',
          900: '#465141',
        },
      },
    },
  },
  plugins: [],
}
