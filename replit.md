# Tim Clever Date

An international dating app exclusively for heterosexual singles with a one-match-at-a-time approach.

## Architecture

- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: Supabase (PostgreSQL via Drizzle ORM) — falls back to in-memory storage if DB unavailable
- **AI**: OpenAI (smart matching, personality insights, content moderation)
- **Authentication**: Email/password + phone/password (no Replit auth)
- **Real-time**: WebSocket for engagement prompts

## Auth Flow

1. **Sign up** — Gmail/email + password OR phone number + password
2. **Verify** — Face scan via camera (AI-powered)
3. **Create Profile** — Name, gender, age, photos, video
4. **Match** — AI-powered one-match-at-a-time

## Key Files

- `client/src/pages/OnboardingPage.tsx` — Sign up / sign in with Gmail or phone
- `client/src/context/AuthContext.tsx` — Auth state management
- `client/src/pages/VerificationPage.tsx` — Camera-based identity verification
- `client/src/pages/ProfileCreationPage.tsx` — Profile setup with photos/video
- `client/src/pages/MatchPage.tsx` — Browse and like/pass potential matches
- `client/src/pages/MessagePage.tsx` — Chat (requires subscription)
- `client/src/pages/WalletPage.tsx` — Digital wallet for sending gifts
- `client/src/pages/ProfilePage.tsx` — User profile and settings
- `server/routes.ts` — All API routes
- `server/storage.ts` — Storage interface (DrizzleStorage + MemStorage fallback)
- `server/ai.ts` — OpenAI integrations
- `shared/schema.ts` — Database schema + Zod validation

## API Routes

### Auth
- `POST /api/auth/register` — Email + password registration
- `POST /api/auth/register-phone` — Phone + password registration
- `POST /api/auth/login` — Email + password login
- `POST /api/auth/login-phone` — Phone + password login
- `POST /api/auth/send-otp` — Send OTP to phone
- `POST /api/auth/verify-otp` — Verify OTP
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user

### Users / Profiles
- `POST /api/users/profile` — Create/update profile with photos
- `PATCH /api/users/me` — Update user fields
- `GET /api/users/:id` — Get user by ID

### Matching
- `GET /api/matches/potential` — Get potential matches
- `GET /api/matches/current` — Get current active match
- `POST /api/matches/like` — Like a user
- `POST /api/matches/pass` — Pass on a user
- `DELETE /api/matches/:id` — Unmatch

### Messaging
- `GET /api/messages/:matchId` — Get messages
- `POST /api/messages/:matchId` — Send message

### Wallet
- `POST /api/wallet/deposit` — Add funds
- `POST /api/wallet/withdraw` — Withdraw funds
- `POST /api/wallet/gift` — Send gift to match

## Design System

- **Primary color**: Royal blue (`#1565c0` / `#1a237e`)
- **Gradient headers**: `linear-gradient(160deg, #1a237e 0%, #1565c0 50%, #0d47a1 100%)`
- **Font**: Poppins (headings), system sans-serif (body)
- **Mobile-first**: PWA-ready with service worker and manifest

## Subscription Tiers

- **None** — Browse only
- **Basic** ($14.99/mo) — Send/receive messages
- **Silver** — Enhanced features
- **Gold** — Premium features  
- **Diamond** ($29.99/mo) — All features + gifting + livestreams

## i18n

6 languages supported: English, Spanish, French, Chinese, Arabic, Hindi.
Auto-detected from browser; persisted in `localStorage` as `preferredLanguage`.
