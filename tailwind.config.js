/** Tailwind theme bound to CSS variable design tokens (see src/index.css). */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: token('color-page'),
        surface: token('color-surface'),
        primary: {
          DEFAULT: token('color-primary'),
          hover: token('color-primary-hover'),
          soft: token('color-soft'),
          fg: token('color-primary-fg'),
        },
        soft: token('color-soft'),
        sage: token('color-sage'),
        ink: token('color-text'),
        muted: token('color-text-muted'),
        line: token('color-border'),
        success: token('color-success'),
        warning: token('color-warning'),
        danger: token('color-danger'),
        forest: token('color-forest'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(36 53 44 / 0.05), 0 1px 3px rgb(36 53 44 / 0.06)',
        pop: '0 10px 30px rgb(36 53 44 / 0.14)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
};
