import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tighter: "-0.02em",
        tight: "-0.01em",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        board: {
          light: "hsl(var(--board-light))",
          dark: "hsl(var(--board-dark))",
          highlight: "hsl(var(--board-highlight))",
          move: "hsl(var(--board-move))",
        },
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        status: {
          success: "hsl(var(--success))",
          warning: "hsl(var(--warning))",
          error: "hsl(var(--error))",
        },
        glass: {
          bg: "hsl(var(--glass-bg))",
          border: "hsl(var(--glass-border))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        glow: "0 0 20px hsla(158, 50%, 45%, 0.25)",
        "glow-lg": "0 0 30px hsla(158, 50%, 45%, 0.35)",
        elevated:
          "0 10px 40px -10px hsla(0, 0%, 0%, 0.3), 0 4px 6px -2px hsla(0, 0%, 0%, 0.1)",
        "elevated-sm":
          "0 4px 20px -4px hsla(0, 0%, 0%, 0.25), 0 2px 4px -1px hsla(0, 0%, 0%, 0.08)",
        glass:
          "0 4px 6px -1px hsla(0, 0%, 0%, 0.1), 0 2px 4px -2px hsla(0, 0%, 0%, 0.1), inset 0 1px 0 0 hsla(0, 0%, 100%, 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "slide-in-right": {
          from: { transform: "translateX(10px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px hsla(158, 50%, 45%, 0.25)" },
          "50%": { boxShadow: "0 0 30px hsla(158, 50%, 45%, 0.4)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "slide-in": "slide-in-right 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
