# Rentiful

[![CI](https://github.com/Austinr-12/Rentiful/actions/workflows/ci.yml/badge.svg)](https://github.com/Austinr-12/Rentiful/actions/workflows/ci.yml)

A two-sided rental marketplace. **Property managers** create listings with photos, a geocoded address, amenities, and pricing, then review tenant applications. **Tenants** search listings on an interactive map with filters, favorite properties, apply, and track their leases and payment history. Approving an application creates a one-year lease and attaches the tenant to the property.

Built with Next.js 15, Express 5, Prisma 6, PostgreSQL + PostGIS, AWS Cognito and S3, and Mapbox GL.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Production Hardening](#production-hardening)
- [Testing and CI](#testing-and-ci)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Known Gaps and Roadmap](#known-gaps-and-roadmap)

---

## Features

**Tenants**
- Map-based property search with 13 filters (price, beds/baths, square footage, property type, amenities, availability, radius from a geocoded location)
- Shareable, back/forward-safe search URLs — filter state lives in the URL
- Favorite properties, submit applications, view current residences, leases, and payment history

**Managers**
- Create listings with multi-photo upload (streamed to S3), server-side geocoding, and PostGIS-backed location
- Review applications and approve or deny them; approval creates the lease and links the tenant in a single transaction
- Manage properties and profile

**Platform**
- Role-based access (`tenant` | `manager`) carried as a Cognito custom claim and verified server-side
- Verified JWTs, ownership checks on every user-keyed route, validated inputs, and a central error handler
- 75 automated tests and a GitHub Actions pipeline on every push

---

## Architecture

```
Browser (Next.js App Router)
  ├─ (auth)/authProvider.tsx      Amplify Authenticator; custom:role captured at sign-up
  ├─ (nondashboard)/              landing, /search (map + listings + filters), /search/[id]
  ├─ (dashboard)/                 managers/{properties, applications, newproperty, settings}
  │                               tenants/{favorites, applications, residences, settings}
  └─ state/api.ts (RTK Query)     17 endpoints; prepareHeaders attaches the Cognito ID token
            |
            v  NEXT_PUBLIC_API_BASE_URL
Express 5 (server/src/app.ts)    helmet, CORS allowlist, JSON body limits
  ├─ authMiddleware(roles)        verify JWT against Cognito JWKS -> req.user { id, role }
  ├─ requireSelf()                :cognitoId must equal req.user.id
  ├─ routes/*                     19 routes across 5 routers, plus /health
  ├─ controllers/*                zod.parse(...) then Prisma; throw HttpError
  ├─ lib/location.ts              PostGIS reads/writes Prisma cannot express
  └─ lib/errors.ts                notFoundHandler + errorHandler (last middleware)
            |
            v
Prisma 6 (single client) -> PostgreSQL + PostGIS   (7 models, 5 enums, 2 implicit m:n tables)
S3 <- photo uploads       Cognito <- identity + role claim
```

**Key flows**

- **Identity to database sync.** On sign-in, the client reads the Cognito session, fetches the profile by role, and creates it on a 404. The server takes the user id from the verified token, so the request body cannot spoof another user.
- **Search state.** Filters live in Redux, hydrate from the URL on load, and write back with a debounced `router.push`. The map and the listings panel subscribe to the same RTK Query cache entry, so one request drives both views.
- **Geospatial search.** `getProperties` composes up to 13 validated filters into `Prisma.Sql` fragments joined with `Prisma.join`, so every value stays a bound parameter. The query includes a PostGIS `ST_DWithin` radius in metres on a `geography(Point, 4326)` column, an enum cast, array containment for amenities, a `NOT EXISTS` lease-overlap check for availability, and `json_build_object` with `ST_X` / `ST_Y` so location and coordinates come back in one round trip.
- **Type sharing.** `server/package.json` runs `postprisma:generate` to copy the generated Prisma types into the client, and `@prisma/client` is a client dev dependency so those types resolve for real.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, Redux Toolkit + RTK Query, react-hook-form + zod, Mapbox GL JS 3, AWS Amplify v6, FilePond, framer-motion |
| **Backend** | Node 20, Express 5, TypeScript, Prisma 6 (`postgresqlExtensions`), zod, `aws-jwt-verify`, AWS SDK v3 (S3 multipart via `@aws-sdk/lib-storage`), multer, helmet, cors, morgan |
| **Data** | PostgreSQL + PostGIS (`geography(Point, 4326)`), Nominatim / Mapbox geocoding |
| **Infrastructure** | AWS Cognito (user pool with `custom:role`), Amazon S3, EC2 + pm2, GitHub Actions |
| **Testing** | Vitest, supertest |

---

## Production Hardening

The initial build followed a tutorial and worked, but carried the problems tutorial code usually does. Everything below was a subsequent solo engineering pass.

| Area | Before | After |
| :--- | :--- | :--- |
| **Auth** | `jwt.decode` trusted any token that parsed | `aws-jwt-verify` checks signature, expiry, issuer, and audience against the Cognito JWKS |
| **Authorization** | Any tenant could read or edit any tenant by changing the URL id; any user could list anyone's applications via a query param | `requireSelf` guard on every `:cognitoId` route; applications, leases, and payments scoped from the verified token; ownership checks on approval and lease listing |
| **Input** | Raw `req.body` passed to Prisma | 9 zod schemas validate every body, query, and path param; 400 with field-level issues |
| **Errors** | try/catch in every handler, 500 for everything | Central handler maps validation, not-found, conflict, and Prisma error codes to correct statuses |
| **Database access** | 5 `PrismaClient` instances; one PostGIS query per property row; one lease query per application | One client; coordinates for a whole list in one query; lease included in the application query; approval and property creation in single transactions |
| **Geo** | Hero search sent `[lat, lng]` while the rest of the app used `[lng, lat]`; radius filter compared degrees over a 1000 km circle | One shared geocode helper; `ST_DWithin` on the geography column in metres with a configurable radius (default 50 km) |
| **Map** | Map instance destroyed and rebuilt on every filter change; popup built from an HTML string | Map created once, markers diffed, container resize observed; popup built with DOM APIs (no HTML injection) |
| **Types** | Shared Prisma types silently resolved to `any` on the client | `@prisma/client` installed client-side; typed API response shapes; 18 latent shape bugs surfaced and fixed |
| **Tests** | None | 75 tests (61 API, 14 client) with mocked Cognito and Prisma; one test caught a real timezone bug in payment-date math |
| **CI** | None | GitHub Actions: typecheck, test, and build for both packages on every push and PR |
| **Repository** | 11,260 tracked files; `node_modules` and `dist` in every commit; broken `start` script and pm2 config | 155 tracked files after a `git filter-repo` rewrite of all 59 commits; working build/start/pm2 pipeline; `.env.example` |

---

## Testing and CI

**75 tests, all passing** — 61 API tests across 5 files and 14 client tests across 2 files.

The API tests mock `aws-jwt-verify` and the Prisma client at the module boundary, so supertest exercises the real Express app, middleware chain, validation, and controllers while asserting on the exact Prisma calls made — for example, that a manager's property list is scoped to `property.managerCognitoId`. No database or AWS credentials are needed to run them.

```bash
# client (repo root)
npm test

# server
cd server && npm test
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests, and build for both packages on every push and pull request, using placeholder environment values so no secrets are required.

---

## Getting Started

### Prerequisites

- Node 20+
- PostgreSQL with the PostGIS extension
- An AWS Cognito user pool with a `custom:role` attribute (`tenant` | `manager`)
- An S3 bucket for property photos
- A Mapbox access token

### 1. Clone and install

```bash
git clone https://github.com/Austinr-12/Rentiful.git
cd Rentiful
npm install
cd server && npm install && cd ..
```

### 2. Configure environment

Copy the example files and fill in your values.

```bash
cp .env.example .env.local
cp server/.env.example server/.env
```

**Client (`.env.local`)**

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_AWS_COGNITO_USER_POOL_CLIENT_ID=
```

**Server (`server/.env`)**

```
DATABASE_URL=postgresql://user:password@localhost:5432/rentiful
CORS_ORIGIN=http://localhost:3000
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
AWS_REGION=
S3_BUCKET_NAME=
```

### 3. Set up the database

```bash
cd server
npx prisma migrate dev      # creates the schema and enables PostGIS
npx prisma generate         # also copies types to the client (postprisma:generate)
npm run seed                # 10 properties, 10 managers, 15 tenants, 15 leases, applications, payments
```

### 4. Run

```bash
# terminal 1 — API
cd server && npm run dev

# terminal 2 — client
npm run dev
```

Open http://localhost:3000. Sign up as a `tenant` or `manager` to see the respective dashboard.

### Production build

```bash
cd server && npm run build && pm2 start ecosystem.config.js
```

---

## Project Structure

```
.
├── src/                        Next.js client
│   ├── app/
│   │   ├── (auth)/             Amplify Authenticator + role capture
│   │   ├── (nondashboard)/     landing, search, property detail
│   │   └── (dashboard)/        managers/*, tenants/*
│   ├── components/             shadcn/ui primitives + app components
│   ├── state/                  Redux store, RTK Query API (17 endpoints)
│   ├── lib/                    schemas (zod), geocode helper, utils
│   └── types/                  generated Prisma types + API response shapes
├── server/
│   ├── prisma/                 schema, migrations (PostGIS), seed
│   └── src/
│       ├── app.ts              Express app (middleware, routers, error handlers)
│       ├── index.ts            server entry
│       ├── middleware/         authMiddleware, requireSelf
│       ├── routes/             5 routers, 19 routes
│       ├── controllers/        zod validation + Prisma
│       ├── lib/                location (PostGIS), errors, schemas
│       └── test/               mocks + API tests
└── .github/workflows/ci.yml
```

---

## Known Gaps and Roadmap

- **Deployment.** The EC2 instance exists but the API is not yet deployed; `CORS_ORIGIN`, `COGNITO_*`, and S3 env vars must be set before first run.
- **Denying an approved application** currently leaves the lease and tenant link in place — product decision pending.
- **Payments** are seeded data; there is no payment-provider integration.
- **No rate limiting** or durable request logging.
- `next.config.ts` still needs the S3 hostname added to `images.remotePatterns`.
- **No end-to-end browser tests** — the current suite covers the API and client logic, not the rendered UI.
- ~18 MB of images in `public/` remain in git history; a CDN or Git LFS would shrink clones.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
