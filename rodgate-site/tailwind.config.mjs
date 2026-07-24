/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Tokens reference CSS variables defined in src/styles/tokens.css.
      // Never hardcode hex in components — always go through these.
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        fg: 'var(--color-fg)',
        muted: 'var(--color-muted)',
        'muted-fg': 'var(--color-muted-fg)',
        border: 'var(--color-border)',
        destructive: 'var(--color-destructive)',
      },
      fontFamily: {
        heading: ['Lexend', 'system-ui', 'sans-serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1120px',
      },
      boxShadow: {
        card: '0 10px 30px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.05)',
        'card-lg': '0 24px 60px rgba(15,23,42,.16)',
      },
    },
  },
  plugins: [],
};
