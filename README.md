# Chesslab

Minimal, focused chess opening **repertoire builder and training platform**, designed for serious improvement. ChessLab lets you **build**, **manage**, and **practice** your chess openings with modern UI, robust authentication, and powerful spaced repetition training.  

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Node.js, NextAuth.js (Google OAuth + Email/Password)
- **Database**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS 4, Radix UI components
- **Chess**: react-chessboard + chess.js
- **Email**: Resend
- **Testing**: Jest + React Testing Library

## Project Structure

```
src/
  app/              # App routes
    (app)/          # Auth protected pages (build, training, settings)
    (auth)/auth/    # Authentication pages
    api/auth/       # NextAuth handlers
  components/       
    Board.tsx       # Interactive chess board
    BuildPanel.tsx  # Repertoire editor
    RepertoirePanel.tsx # Opening browser
    ui/             # Radix UI wrappers
  lib/
    auth.ts         # Auth config
    sm2.ts          # Spaced repetition algorithm
    email.ts        # Email service
    prisma.ts       # DB client
  proxy.ts          # Route protection
__tests__/          # Tests (Jest + React Testing Library)
prisma/schema.prisma # DB schema
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

>>>>>>> dev
