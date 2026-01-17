# Chesslab

A chess opening repertoire builder and training platform. Build, manage, and practice chess opening lines.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Node.js, NextAuth.js (Google OAuth + Email/Password)
- **Database**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS 4, Radix UI components
- **Chess**: react-chessboard + chess.js
- **Email**: Resend
- **Testing**: Jest + React Testing Library

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local`:
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
RESEND_API_KEY="..."
FROM_EMAIL="noreply@chesslab.dev"
```

3. Setup database and run:
```bash
npx prisma db push
npm run dev
```

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Protected routes (require auth)
│   │   ├── page.tsx        # Home/dashboard
│   │   ├── build/[color]/  # Build repertoire
│   │   ├── repertoire/     # View openings
│   │   ├── training/       # Practice mode
│   │   └── settings/       # User settings
│   ├── (auth)/auth/        # Login/register
│   └── api/auth/           # NextAuth handlers
├── components/
│   ├── Board.tsx           # Interactive chess board
│   ├── BuildPanel.tsx      # Repertoire editor
│   ├── RepertoirePanel.tsx # Opening browser
│   ├── Sidebar.tsx         # Navigation
│   └── ui/                 # Radix UI wrappers
├── lib/
│   ├── auth.ts             # Auth config
│   ├── email.ts            # Email service
│   └── prisma.ts           # DB client
├── proxy.ts                # Route protection logic
└── types/                  # TypeScript types

prisma/schema.prisma        # Database schema
__tests__/                  # Tests
```

## Route Protection

Unauthenticated users accessing protected routes (`/`, `/build/*`, `/repertoire`, `/training`, `/settings`) are redirected to `/auth` page via client-side session checks in protected pages. Route protection logic is defined in `src/proxy.ts` but wired up at the page level using `useSession()` hook.

## Features

- **Authentication**: Email/password (with verification) + Google OAuth
- **Repertoire Builder**: Interactive board to add opening lines by color
- **Move Navigation**: First, previous, next, last, reset controls
- **Progress Tracking**: Track learned lines per opening
- **Build Mode**: Add new moves to repertoires
- **Playback Mode**: Navigate through recorded lines

## Authentication Flow

### Email/Password Registration
1. User enters email and password on `/auth` page
2. System checks for existing user
3. Password hashed and user created with `emailVerified: null`
4. 24-hour verification token generated
5. Email sent via Resend with verification link
6. **User cannot login until email verified**

### Email/Password Login
1. User enters credentials
2. Password compared with hash
3. If not verified: new verification token sent, login blocked
4. If verified: JWT session created

### Google OAuth
1. User clicks "Continue with Google"
2. Redirects to Google consent screen
3. Account created/linked if new user
4. **Immediately logged in** (no email verification)

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Run ESLint
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

