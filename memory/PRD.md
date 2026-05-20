# Yoshitaka Karate Dojo — Custom CMS

## Original Problem Statement
Build a custom CMS for a Shotokan karate dojo with role-based dashboards, an 18-level belt
ranking path, payments ledger, attendance tracking, blog, notifications, and per-user
digital ID cards. Backend deployed to Render; database on Hostinger MySQL; frontend
static build served by Hostinger.

## Architecture
- **Frontend**: React 19 + Tailwind + shadcn (build → Hostinger VPS / nginx)
- **Backend**: FastAPI + SQLAlchemy/SQLModel + aiomysql (Hostinger VPS / gunicorn + systemd)
- **DB**: MySQL 8 on the same VPS (local-socket, pooled with `pool_pre_ping`)
- **Auth**: JWT custom auth. Login accepts **email, username, OR member_number**.
- **Routing**: `BrowserRouter` (clean URLs, nginx SPA fallback via `try_files`).

## Roles (hierarchy, highest → lowest)
super_admin → admin → renshi → sensei → team_member → student

## Implemented (✅)
- MongoDB → MySQL migration + Render deploy
- 18-level belt system & path UI
- 6 hierarchical roles + granular permission table
- CMS page editor (Home, About, Programs, Schedule, Contact, ID Card)
- Horizontal certificate-style ID card with QR + Logo + PDF export
- Blog (rich text, images)
- Notifications (in-app bell + admin compose)
- Payment Calendar + invoice ledger + email reminders
- Removed Enroll page; Google OAuth disabled on Login (username/email + password only)
- Manual User Management UI: `AddUserModal` + `UserDrawer` wired into Admin/Super Admin "Users" tab
- Hostinger CI build green (`react-hooks/exhaustive-deps` exempted in IDCard.jsx)
- **[2026-02-14] Username login + per-user QR + ID card polish**
  - `users.username` (unique) and `users.qr_code` (unique, opaque `YK-QR-…`) columns added
    (idempotent ALTER TABLE migration in `db.py`)
  - Login resolver accepts email, username, or member_number
  - `AddUserModal` collects optional username
  - `UserDrawer` exposes username field + QR section with **Regenerate QR** button
  - QR code rendered in **red** (`#D7263D`) by server using `qrcode.QRCode` with `fill_color`
  - Barcode removed from ID card display + API response
  - Per-user **background image** override (admin/super_admin only) in `UserDrawer`
    → stacks as faded watermark on the certificate (`background_url` in `idcard_overrides`)
  - Attendance scan now accepts both new `YK-QR-…` and legacy `YOSHITAKA|…` formats
- **[2026-02-14] Blog tab for all users**
  - `BlogReader` component (read-only) embedded in `StudentDashboard` via tabs
  - Lists published posts + inline post viewer; no public-page navigation required
- **[2026-02-17] ID Card polish (final pass)**
  - `background_size` slider (25–200%) added in `UserDrawer` → scales watermark via CSS transform
  - Member photo inputs (Profile + ID Card tabs) now use `capture="environment"` → opens native camera on mobile
  - `drawHorizontalCardOnPdf` adds `TOP_PAD` safe-zone so CR-80 prints no longer clip ascenders
  - `drawVerticalCardOnPdf` logo + heading Y-coords shifted to clear logo
  - Horizontal layout (DOM + PDF) stacks Role → Rank → Member # vertically so Rank can never crowd the QR column
- **[2026-02-17] Migrated off Render → Hostinger VPS (187.77.15.182, Ubuntu 24.04, KVM 1)**
  - `HashRouter` → `BrowserRouter` (clean URLs; nginx handles SPA fallback)
  - `db.py`: switched MySQL pool from `NullPool` → standard pool with `pool_pre_ping`, `pool_recycle=1800`; opt-in `DB_USE_NULLPOOL=1` for remote-MySQL setups
  - `api.js`: removed Render fallback URL + aggressive cold-start retry; now 2 quick retries (≤1.8s) for transient 502/503/504 only, 20s timeout
  - `server.py`: tightened CORS regex (dropped `hostingersite.com`; kept localhost, preview, `yoshitakakaratedo.com`)
  - Added `/app/deploy/`: `README.md` (runbook), `nginx-yoshitaka.conf`, `yoshitaka-api.service` (systemd), `yoshitaka-api.env.example`, `deploy.sh` (one-command updates)
  - `frontend/.env.production` points the build at `https://portal.yoshitakakaratedo.com` (single-domain, path-based `/api` routing)
- **[2026-02-17] Bug fix — QR / ID-card overrides silently dropped on self-edit**
  - PATCH `/users/{user_id}`: previously when a user edited *themselves* (even super_admin), the allowed-fields set was hard-coded to 6 profile fields, so `idcard_overrides` + `idcard_template` were filtered out before reaching the DB
  - Reordered the permission ladder: super_admin/admin get full perms even when self-editing; lower roles editing themselves still get the limited set, but ID-card customisation (`idcard_template`, `idcard_overrides`) is always allowed so members can tweak their own card
  - Verified end-to-end via Playwright: pick color → save → reopen → color persists, QR re-renders with the new fill

## Backlog
### P1
- 📸 OCR auto-fill in Add User (pick: Gemini 3 / GPT-4o / Claude Sonnet 4.5)
- 📱 QR scan attendance UX polish (mobile camera flow)

### P2
- Stripe online tuition payments
- Bulk monthly invoice generation
- Microsoft OAuth (scaffolded, inactive)

## Key Files
- `/app/backend/server.py` — auth (multi-identity login), user CRUD, QR (red) + regenerate, payments, CMS
- `/app/backend/features.py` — blog, notifications, permissions
- `/app/backend/db.py` — NullPool config + per-column ALTER TABLE migration
- `/app/backend/models.py` — User model with `username`, `qr_code`, PII, `idcard_overrides`
- `/app/frontend/src/pages/dashboard/AdminDashboard.jsx` — Admin/SuperAdmin shell
- `/app/frontend/src/pages/dashboard/StudentDashboard.jsx` — tabs: Overview + Blog
- `/app/frontend/src/components/UserDrawer.jsx` — username + QR regen + background override
- `/app/frontend/src/components/AddUserModal.jsx` — manual create w/ username
- `/app/frontend/src/components/IDCard.jsx` — certificate component (no barcode)
- `/app/frontend/src/components/BlogReader.jsx` — embedded read-only blog viewer
- `/app/frontend/src/lib/idcardTemplates.js` — Student / Team Class / Sensei templates

## Critical Operational Notes
- **VPS deploy**: see `/app/deploy/README.md` — full runbook + one-command `./deploy/deploy.sh`
- MySQL lives on the same VPS as FastAPI; standard pool with `pool_pre_ping` handles idle drops
- All backend routes prefixed `/api`
- Frontend uses `BrowserRouter`; nginx SPA fallback is `try_files $uri /index.html`
- Use `REACT_APP_BACKEND_URL` from `frontend/.env.production` (build-time) — points at `https://api.yoshitakakaratedo.com`
- Backend env lives at `/etc/yoshitaka-api.env` on the VPS (chmod 600); template at `/app/deploy/yoshitaka-api.env.example`
- Test credentials in `/app/memory/test_credentials.md`
