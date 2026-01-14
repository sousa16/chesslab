# Chesslab

Minimal, focused, training-first platform for chess improvement.

## Stack

- **Framework**: [Next.js](https://nextjs.org) 16 (App Router)
- **Auth**: [Auth.js](https://authjs.dev) with Google OAuth + Email/Password
- **Database**: PostgreSQL via [Neon](https://neon.tech)
- **ORM**: [Prisma](https://www.prisma.io)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) 4 with custom color system
- **UI**: Custom component library with [Radix UI](https://www.radix-ui.com) primitives
- **Chess**: [react-chessboard](https://www.npmjs.com/package/react-chessboard) + [chess.js](https://www.npmjs.com/package/chess.js)
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- Google OAuth credentials (for authentication)

### Setup

1. Clone the repo and install dependencies:
```bash
npm install
```

2. Create `.env` with:
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

3. Initialize the database:
```bash
npx prisma generate
npx prisma db push
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Authentication

- **Google OAuth**: Click "Continue with Google" on the auth page
- **Email/Password**: Create an account or sign in with credentials
- Passwords are hashed with bcryptjs; sessions use JWT

## Project Structure

```
src/
├── app/
│   ├── (auth)/        # Auth pages and routes
│   ├── (app)/         # Protected app pages with chessboard
│   ├── api/auth/      # Auth.js API routes
│   └── layout.tsx     # Root layout
├── components/
│   ├── Board.tsx          # Interactive chessboard display
│   ├── BoardControls.tsx  # Move navigation controls
│   └── ...                # Other UI components
├── lib/              # Auth config, Prisma client, utilities
├── types/            # TypeScript types
└── app.css           # Tailwind styles
```

## Development

- Use `npm run dev` to start dev server
- Use `npm run build` to build for production
- Use `npm run lint` to check code style
- Use `npm test` to run tests (backend + component tests)

## Features

### Chessboard
- Full interactive chess board with piece rendering
- Board controls for move navigation (First, Previous, Next, Last, Reset)
- Responsive sizing with proper aspect ratio
- Custom color palette matching the design system

### Testing
- Backend tests with Jest for API routes and utilities
- Component tests using React Testing Library
- Tests for Board and BoardControls components included

## Color System

Custom HSL-based palette:
- **Background**: Deep charcoal (220 12% 9%)
- **Foreground**: Warm off-white (220 10% 82%)
- **Primary**: Deep muted green (158 35% 38%)
- **Surfaces**: 3 levels for depth
- **Status**: Success (green), Error (red), Warning (orange)
