import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-base':        'var(--bg-base)',
        'bg-surface':     'var(--bg-surface)',
        'bg-elevated':    'var(--bg-elevated)',
        'bg-subtle':      'var(--bg-subtle)',

        // Borders
        'border-default': 'var(--border-default)',
        'border-strong':  'var(--border-strong)',

        // Text
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        'text-inverse':   'var(--text-inverse)',

        // Accent
        'accent':         'var(--accent)',
        'accent-hover':   'var(--accent-hover)',
        'accent-subtle':  'var(--accent-subtle)',

        // Status
        'status-open':          'var(--status-open)',
        'status-open-bg':       'var(--status-open-bg)',
        'status-patched':       'var(--status-patched)',
        'status-patched-bg':    'var(--status-patched-bg)',
        'status-confirmed':     'var(--status-confirmed)',
        'status-confirmed-bg':  'var(--status-confirmed-bg)',

        // Semantic
        'success':  'var(--success)',
        'warning':  'var(--warning)',
        'error':    'var(--error)',
        'info':     'var(--info)',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
