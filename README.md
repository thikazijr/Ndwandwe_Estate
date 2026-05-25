# Ndwandwe Estate — Guesthouse Management System

A modern web app for running a boutique guesthouse end to end: bookings, rooms, housekeeping, billing, and guest self-service—all in one place.

## Overview

**Ndwandwe Estate** helps staff manage daily operations from a single dashboard, while guests and housekeepers use lightweight portals on their phones. Data is stored in **Supabase** and updates in **real time**, so reception, housekeeping, and management always see the latest room status without refreshing the page.

## Features

### Staff dashboard (`index.html`)
- Role-based access for **Admin**, **Receptionist**, and **Housekeeper**
- Dashboard with occupancy metrics and service requests
- Guest and booking management, calendar view, and invoicing
- Room status, maintenance, and iCal channel sync
- In-app notifications and staff messaging
- QR codes for guest and housekeeper portals

### Guest portal (`portal.html`)
- View stay details and running bill
- Request services and confirm deliveries
- Late checkout / stay extension requests
- Self-service checkout flow

### Housekeeping portal (`housekeeping-login.html` → `housekeeping.html`)
- Secure login via QR token
- Assigned cleaning tasks
- Mark rooms clean or dirty with instant feedback
- Notifies reception when a room is ready

## Tech stack

- HTML, CSS, JavaScript (no build step)
- [Supabase](https://supabase.com) — database, auth, and realtime
- Hosted on [Vercel](https://vercel.com) (static deployment)
- Optional local scripts in `scripts/` for seeding housekeepers and tasks

## Local setup

```bash
npm install          # only needed for scripts/, not for running the web app
```

Open `index.html` with a local server (e.g. Live Server), or deploy to Vercel.

Configure Supabase credentials in `supabaseClient.js`. Keep secrets in `.env` for CLI scripts only—never commit `.env`.

## Project structure

| Path | Purpose |
|------|---------|
| `index.html` | Main staff application |
| `portal.html` | Guest self-service portal |
| `housekeeping.html` | Housekeeper task portal |
| `app.js` / `dataStore.js` | App logic and data layer |
| `migrations/` | SQL reference for Supabase tables |
| `scripts/` | One-off admin utilities |

## License

Private project for Ndwandwe Estate.
