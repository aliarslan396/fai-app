# FAI — Project Context (Claude Code)

**Read this first every session. All decisions locked here. Saves tokens.**

## ⚠ BINDING SCOPE DOCUMENT — READ FIRST EVERY SESSION

**Source of truth:** `/home/arslan/Fai-Manager-complete-build/PROJECT_PLAN.md`

This is the FULL client-provided spec (converted from `FAI_Manager_Complete_Build_Reference (2).docx`).
Every module, every field, every workflow described in that doc is CONTRACTUALLY IN SCOPE.

**Rules for every session:**
1. Open `PROJECT_PLAN.md` at the start of every session
2. Reference specific section number (3.1, 3.2, etc.) when implementing any feature
3. Never trust a summary — go back to the doc
4. Flag discrepancies between what's built and what the doc says IMMEDIATELY
5. Ignore `PROJECT_PLAN.summary.backup.md` — that was the old dropped-scope summary, kept for reference only

---

## Project Identity

- **Product:** FAI (Quality Management System for aerospace inspection)
- **Client:** Timothy Smith (aerospace shop owner)
- **Goal:** Replace 1-Factory with AI-powered inspection tool
- **Two layers:** Internal shop tool (Layer 1) → Multi-tenant SaaS (Layer 2)

---

## Tech Stack (LOCKED)

```
Backend:        Laravel 10 (PHP 8.1)
Frontend:       Next.js 14 (App Router, TypeScript, Tailwind)
Database:       PostgreSQL 16 (in Docker)
Cache/Queues:   Redis 5
OCR:            Python FastAPI + Tesseract + OpenCV (Phase 2)
AI Bubbles:     GPT-4o Vision (Phase 2)
Storage:        Cloudflare R2 (Phase 2)
Auth:           Laravel Sanctum + TOTP + Twilio SMS
Multi-tenant:   stancl/tenancy
PDF Export:     mPDF (Phase 4)
Excel Export:   PhpSpreadsheet (Phase 4)
Billing:        Stripe (Layer 2)
UI Library:     shadcn/ui + Tailwind CSS
Deployment:     DigitalOcean + Nginx + Cloudflare wildcard subdomain
```

---

## Project Structure

```
/home/arslan/fai-app/
├── backend/          → Laravel 10 API
├── frontend/         → Next.js 14 SPA
├── ocr-service/      → Python FastAPI (Phase 2)
└── CLAUDE.md         → This file
```

---

## Local Dev Environment (Docker Compose)

**All services run in Docker.** No system PHP/Postgres/Redis needed.

| Service | Container Port | Host Port |
|---|---|---|
| Postgres 16 | 5432 | 5433 |
| Redis 7 | 6379 | 6380 |
| Backend (Laravel + PHP 8.2 + pgsql ext) | 8000 | 8000 |
| Queue worker | — | — |
| Frontend (Next.js + Node 20) | 3000 | 3000 |

**Start everything:**
```bash
cd /home/arslan/fai-app
docker compose up -d
docker compose logs -f          # tail logs
```

**Stop:**
```bash
docker compose down              # stop containers
docker compose down -v           # stop + delete volumes (WIPE DB)
```

**Run artisan inside container:**
```bash
docker compose exec backend php artisan migrate
docker compose exec backend php artisan migrate:fresh --seed
docker compose exec backend php artisan tinker
```

**Run composer inside container:**
```bash
docker compose exec backend composer require <package>
```

**Run npm inside frontend container:**
```bash
docker compose exec frontend npm install <package>
```

**Access Postgres:**
```bash
docker compose exec postgres psql -U fai_user -d fai_app
```

---

## User Roles (Locked)

| Role | Access |
|---|---|
| Admin | Everything including create/disable users |
| QA Manager | All create/delete — cannot touch users |
| QA Inspector | Create + edit inspections |
| Shop Floor | Edit only |
| Viewer | Read only |

---

## Business Logic Quick Reference

**Bubble = numbered annotation on engineering drawing image, marks one dimension to measure.**

**Pass/Fail logic:**
```
min = nominal - tolerance
max = nominal + tolerance
if (measured >= min && measured <= max) → PASS (green)
else → FAIL (red) → NCR auto-created
```

**Three bubble modes:**
1. Full Auto — AI scans drawing, places all bubbles
2. Semi Auto — AI highlights, user clicks to confirm
3. Full Manual — User clicks zone, places bubble manually

**Inspection forms:**
- AS9102 FAI (aerospace standard) — Form 1, 2, 3 — Excel + PDF export
- DEF-QA-003 (Timothy's internal) — 20-row table — PDF only

---

## Phase Status

- [x] Phase 0: Planning + tech stack lock
- [ ] **Phase 1: Foundation (Weeks 1–4)** ← CURRENT
  - [x] Week 1: Setup + base schema
  - [~] Week 2: Multi-tenant — backend done (5/10 tasks). Frontend pending.
  - [ ] Week 3: Full auth flow (register, MFA setup/verify, password reset)
  - [ ] Week 4: User CRUD UI, master admin panel
- [ ] Phase 2: Drawing Engine (Weeks 5–8)
- [ ] Phase 3: Inspection Core (Weeks 9–12)
- [ ] Phase 4: Export + Dashboard (Weeks 13–16) — Layer 1 done
- [ ] Phase 5: Layer 2 SaaS (Weeks 17–20)
- [ ] Phase 6: Polish + Deploy (Weeks 21–24)

## Week 1 Boilerplate — DONE

**Backend (Laravel 10):**
- `.env` configured for Postgres/Redis
- Composer packages installed: stancl/tenancy, predis/predis, twilio/sdk, pragmarx/google2fa-laravel, bacon/bacon-qr-code, spatie/laravel-permission
- Migrations: users (with MFA + brute force fields), audit_logs, trusted_devices, password_reset_codes, tenants + domains
- Models: User, TrustedDevice, AuditLog, PasswordResetCode, Tenant
- AuthController stub with login, lockout, audit log integration
- API routes at `/api/v1/auth/*`
- CORS configured for localhost:3000 + wildcard subdomain
- RoleSeeder with 5 roles + 40 permissions
- DatabaseSeeder creates admin@fai.app and inspector@fai.app (password: `password`)

**Frontend (Next.js 16 + React 19 + Tailwind 4):**
- shadcn/ui installed (button, input, card, form, dialog, sonner, etc.)
- API client (`src/lib/api.ts`) with auth token + tenant header injection
- Zustand auth store (`src/lib/auth-store.ts`) with persist
- Login page (`/login`) — modern shadcn design
- App layout (`src/app/(app)/layout.tsx`) with auth guard
- Sidebar nav with permission/role filtering
- Header with user dropdown + logout
- Dashboard page skeleton

## Pending User Actions (Phase 1 Week 1)

1. Create Postgres DB + user (sudo commands)
2. Run `php artisan migrate --seed`
3. Start backend: `php artisan serve` (port 8000)
4. Start frontend: `nvm use 20 && npm run dev` (port 3000)
5. Test login at http://localhost:3000/login (email: admin@fai.app / pass: password)

---

## Critical Rules (DO NOT FORGET)

1. **No pricing/hours/dollar amounts in chat output.** Upwork tracker captures screenshots client sees.
2. **Design must be modern, clean, premium.** Use shadcn/ui + Tailwind. No raw Bootstrap. Reference: Linear, Vercel, Notion style.
3. **Web only — not mobile app.** Responsive enough for tablet shop floor use, that's it.
4. **PHP 8.1 + Laravel 10** (NOT Laravel 11 — needs PHP 8.2+).
5. **Use `php /home/arslan/.local/bin/composer`** for composer commands (system composer is v1, broken).

---

## Model Strategy

| Working On | Model |
|---|---|
| Auth, security, permissions, multi-tenant logic | Opus 4.7 |
| CRUD, UI, migrations, config, boilerplate | Sonnet 4.6 |
| AI/image/payment/complex logic | Opus 4.7 |

Default Sonnet. Switch to Opus when hitting hard problems.

---

## Common Commands

**Backend:**
```bash
cd /home/arslan/fai-app/backend
php artisan serve                    # Dev server (port 8000)
php artisan migrate                  # Run migrations
php artisan migrate:fresh --seed     # Reset DB with seed data
php /home/arslan/.local/bin/composer require <package>
```
**Frontend:**
```bash
cd /home/arslan/fai-app/frontend
nvm use 20                          # Always before npm commands
npm run dev                         # Dev server (port 3000)
npm install <package>
```

**Database:**
```bash
sudo -u postgres psql               # Postgres CLI
sudo systemctl status postgresql    # Check running
sudo systemctl status redis-server  # Check Redis
```

---

## Database Naming

- Main DB: `fai_app`
- Tenant DBs (Layer 2): `tenant_<slug>` (e.g. `tenant_acme`)
- Postgres user: `fai_user` (to be created)

---

## API Convention

- All API routes prefixed: `/api/v1/`
- Auth via Sanctum tokens
- JSON only
- Tenant context via `X-Tenant` header OR subdomain

---

## End-of-Session Checklist for Claude

When ending a session, update this file:
- Mark completed weeks with [x]
- Add any new locked decisions
- Note any blockers
- Update common commands if new ones added
