/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Below this a phone is narrow enough that the search field needs the
        // whole row: the decorative magnifier and the wider padding cost more
        // than they give. Added to the default scale, not replacing it.
        xs: '380px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      fontSize: {
        // Minimums enforced by the readability spec.
        'ui-xs': ['0.875rem', { lineHeight: '1.35rem' }], // 14px — smallest allowed
        'ui-sm': ['0.9375rem', { lineHeight: '1.5rem' }], // 15px — buttons
        'ui-base': ['1rem', { lineHeight: '1.65rem' }], // 16px — body
        'ui-lg': ['1.0625rem', { lineHeight: '1.75rem' }], // 17px
        'prose-base': ['1.0625rem', { lineHeight: '1.8rem' }], // 17px explanations
        'prose-lg': ['1.125rem', { lineHeight: '1.9rem' }], // 18px explanations
        'scripture-sm': ['1.0625rem', { lineHeight: '1.85rem' }], // 17px mobile
        'scripture-md': ['1.1875rem', { lineHeight: '2rem' }], // 19px
        'scripture-lg': ['1.375rem', { lineHeight: '2.25rem' }], // 22px desktop
      },
      colors: {
        sky: {
          50: '#f0f8ff',
          100: '#dceeff',
          200: '#b8dcff',
          300: '#84c3ff',
          400: '#4aa3fb',
          500: '#1f83ef',
          600: '#0e66cc',
          700: '#0d52a4',
          800: '#114686',
          900: '#143b6e',
          950: '#0b2447',
        },
        dawn: {
          100: '#fff2dd',
          200: '#ffe0b0',
          300: '#ffc978',
          400: '#ffb04a',
          500: '#f79433',
        },
        gold: {
          200: '#ffeab8',
          300: '#ffdc8a',
          400: '#f5c65a',
          500: '#e0a92e',
        },
        ink: {
          DEFAULT: '#0a1a2f',
          soft: '#1c2f4a',
          muted: '#41556f',
        },
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glass: '0 10px 40px -12px rgba(6, 22, 48, 0.55), inset 0 1px 0 0 rgba(255,255,255,0.10)',
        'glass-light': '0 10px 32px -14px rgba(6, 22, 48, 0.35), inset 0 1px 0 0 rgba(255,255,255,0.75)',
        lift: '0 18px 50px -20px rgba(4, 16, 38, 0.65)',
      },
      borderRadius: { xl2: '1.25rem', '3xl': '1.75rem' },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        drift: {
          '0%': { transform: 'translate3d(-3%, 0, 0)' },
          '50%': { transform: 'translate3d(3%, -1%, 0)' },
          '100%': { transform: 'translate3d(-3%, 0, 0)' },
        },
        twinkle: { '0%,100%': { opacity: '0.25' }, '50%': { opacity: '0.9' } },
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
        drift: 'drift 60s ease-in-out infinite',
        'drift-slow': 'drift 110s ease-in-out infinite',
        twinkle: 'twinkle 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
