# IMG CRM Jordan — Execution Plan
### Updated: 2026-05-13 (verified against actual code)

---

## Real Current State

Your original plan said "Database / API / Auth = NOT BUILT." That was stale.
Here is what was actually verified today:

| Milestone | Status | Evidence |
|-----------|--------|----------|
| M0 — Planning | ✅ Done | Spec, seed Excel, UI designs |
| M1 — Foundation (DB + Auth) | ✅ Done | schema.js (17 tables), auth.js (JWT + bcrypt), seed.js (7 users, permissions, settings) |
| M2 — Core API | ✅ Done | opportunities.js (316 lines), contacts.js, organizations.js, stage_history logging, file uploads |
| M3 — Frontend ↔ Backend | 🟡 Partial | Design pages wired. **Pipeline.html still on demo data until B.1 is tested.** |
| M4 — Design Department | ✅ Mostly done | design.js (680 lines), DesignBoard, MyTasks, AC/Heating form. **Gap: still uses demo-auth header, not real JWT.** |
| M5 — Closing & Discounts | 🟡 Backend done, UI missing | approvals.js + /close endpoint exist. No CloseDealModal or DiscountModal in frontend yet. |
| M6 — Activities & Notifications | 🟡 Thin | activities.js (54 lines), notifications.js (29 lines). Basic CRUD only — no overdue, no health indicators. |
| M7 — Notes & Admin | ❌ Not started | No notes table in schema, no admin UI, no user management page. |
| M8 — Reports & Dashboards | ❌ Shell | Reports.html exists but is a skeleton — no real data. |
| M9 — Polish | ❌ Not started | |
| M10 — Deploy | ❌ Not started | |

**Default password for all users:** `IMG@2026`
**Users:** admin, essam, yazan, mahmoud, sally, omar, hilal (all @img.com)

---

## Immediate Next Steps (Sessions B + C)

These must be done in order before anything else. Each step = one focused session.
Test after each one before moving on.

---

### ✅ B.1 — Pipeline reads from API (DONE TODAY)
**What was done:**
- Added `adaptOppFromApi()` helper in `scripts/13-app.jsx`
- Added a `useEffect` that fetches `GET /api/opportunities` on mount
- Falls back to demo data if API fails

**How to verify:**
1. Run: `cd jordan-crm && npm start`
2. Open: http://localhost:4000/pipeline-v3/Pipeline.html
3. Open DevTools console → should see: `Pipeline: loaded 15 opportunities from API`
4. Open DevTools Network tab → reload → verify `GET /api/opportunities` returns JSON
5. Switch sidebar user to Mahmoud → should see only Mahmoud's deals (API-filtered)

**Before moving to B.2:** Confirm the console message appears.

---

### ⏳ B.2 — Pipeline writes to API
**What to build:**
- Kanban drag → `POST /api/opportunities/:id/stage`
- "New Deal" button → `POST /api/opportunities` (save to DB, not in-memory)
- Field edits in deal detail → `PUT /api/opportunities/:id`
- Delete deal → `DELETE /api/opportunities/:id`

**Key files to edit:**
- `scripts/13-app.jsx` — `handleAdvance`, `handleCardAction`, new deal creation (lines 327, 407)
- `scripts/11-deal-detail.jsx` — edit mode save buttons
- `scripts/09-kanban.jsx` — drag-drop handler

**How to know it's done:**
- Create a deal → refresh page → deal is still there
- Drag a card from Prospect to Tender → refresh → card is in Tender
- Delete a deal → refresh → deal is gone

---

### ⏳ B.3 — Verify Contacts page
**What to check:**
- Does Contacts.html (`scripts/15-contacts-app.jsx`) read from `GET /api/contacts`?
- Does "New Contact" save to DB?

**If not wired:** same treatment as B.1/B.2 — add fetch + adapter.

---

### ⏳ B.4 — Real login screen
**What to build:**
- Login page (email + password form) → `POST /api/auth/login` → store JWT in localStorage
- Replace demo-auth header (`x-demo-user-id`) in `00-api.js` with `Authorization: Bearer <token>`
- Redirect to login if no token or token expired
- Swap design routes from `demoAuth` middleware to real `authMw` in `routes/design.js`

**This is the "prototype → product" moment.** After B.4, real users log in with real passwords.

---

### ⏳ C.1 — Close Deal modal (Won/Lost)
**What to build:**
- Add `CloseDealModal` to `scripts/12-popups.jsx`
  - Outcome picker: Won / Lost
  - If Lost: dropdown loaded from `GET /api/opportunities/meta/lost-reasons` (mandatory)
  - Optional notes field
- Wire "Close as Won" / "Close as Lost" buttons in `scripts/11-deal-detail.jsx`
  - Visible to: deal owner (salesman) + sales_manager + admin — always visible on detail
- On submit → `POST /api/opportunities/:id/close` → refetch deal → show closed badge

**How to know it's done:**
- Open a deal → click Close as Won → deal moves off the Kanban
- Open a deal → click Close as Lost → modal requires a reason → deal archived

---

### ⏳ C.2 — Apply Discount modal
**What to build:**
- Add `ApplyDiscountModal` to `scripts/12-popups.jsx`
  - Input: discount percentage
  - Modal fetches current `discount_limit` from settings (default 30%)
  - If % ≤ limit: apply directly to quotation (`PUT /api/opportunities/:id` or quotation endpoint)
  - If % > limit: `POST /api/approvals` → show "Pending sales manager approval" state on deal card
- Wire "Apply Discount" button in deal detail (visible to salesman + sales_manager)

---

### ⏳ C.3 — Approval Inbox (sales manager only)
**What to build:**
- Section in topbar bell popover OR a dedicated sidebar item (visible only to sales_manager + admin)
- Fetches `GET /api/approvals/pending`
- Each row: requester name, deal title, requested %, "Approve" / "Reject" buttons
- On respond → `POST /api/approvals/:id/respond`
- Notifies salesman via socket (already wired in backend)

---

### ⏳ C.4 — Socket.io toast notifications
**What to build:**
- Connect socket.io client in `scripts/13-app.jsx` (or a shared init)
- On events `discount_response`, `opportunity_closed`, `stage_change`: fire a toast via `fireToast()`
- The socket server and room-join logic already exists in `server.js:62`

---

## After Sessions B + C: Remaining Milestones

Once B.1–B.4 + C.1–C.4 are done, you have a real working product.
These come next, in order:

### M6 — Activities & Notifications (2–3 sessions)
- `activities.js` exists but is thin (54 lines). Needs:
  - Manager assigns activity to subordinate
  - Overdue detection (flag activities past `end_dt`)
  - Green/yellow/red health indicator on Kanban cards
  - Bell icon unread count (notification dot)
  - Mark activity as done

### M7 — Notes & Admin (2–3 sessions)
- Add `notes` table to schema (personal notes with reminders)
- Admin settings page (edit discount_limit, lost reasons, etc.)
- User management page (add/edit/deactivate users)
- Labels management
- Saved views

### M8 — Reports & Dashboards (3–4 sessions)
- `Reports.html` is currently a skeleton
- Pipeline conversion funnel, salesman performance, product breakdown
- Lost reason analysis, monthly trend, design performance (admin only)
- Forecasting with weighted pipeline values

### M9 — Polish (2–3 sessions)
- Global search
- Mobile responsive cleanup
- Data export (CSV/Excel)
- Error handling edge cases
- Onboarding guide

### M10 — Deploy (1–2 sessions)
- Cloud or local server setup
- Domain (crm.img.com), SSL
- Load real data from Excel
- Create real user accounts
- Pilot rollout → full rollout

---

## Rules (from your original plan — still apply)

1. **Never skip a milestone.** B before C. M5 before M6.
2. **Each step must work before moving on.** Test manually, check DevTools.
3. **One session per sub-task.** Don't combine B.2 + B.3 + B.4 into one prompt.
4. **Test as each role.** Can Yazan do his job? Can Sally? Can Essam approve a discount?
5. **Commits after each working step.**

---

## Quick Reference

| URL (dev) | What it is |
|-----------|------------|
| http://localhost:4000/pipeline-v3/Pipeline.html | Kanban pipeline (active build) |
| http://localhost:4000/pipeline-v3/DesignBoard.html | Sally's design board |
| http://localhost:4000/pipeline-v3/MyTasks.html | Designer task list |
| http://localhost:4000/pipeline-v3/Contacts.html | Contacts page |
| http://localhost:4000/api/auth/login | POST: `{email, password}` → JWT |
| http://localhost:4000/api/opportunities | GET all opps |
| http://localhost:4000/api/approvals/pending | GET pending discounts (manager) |

| Key file | What it does |
|----------|-------------|
| `routes/opportunities.js` | All opp CRUD + stage transitions + close |
| `routes/approvals.js` | Discount approval request/respond |
| `routes/design.js` | Full design workflow (680 lines) |
| `routes/auth.js` | Login, verify, change-password |
| `database/schema.js` | All 17+ tables |
| `database/seed.js` | Users, roles, permissions, settings |
| `database/design_seed.js` | 20 orgs + 15 opps + 9 design requests |
| `scripts/13-app.jsx` | Pipeline app orchestrator |
| `scripts/12-popups.jsx` | All modal dialogs |
| `scripts/11-deal-detail.jsx` | Deal detail drawer |
| `scripts/18-design-board.jsx` | DesignBoard page logic |
| `scripts/19-my-tasks.jsx` | MyTasks page logic |
| `scripts/20-design-request-form.jsx` | AC/Heating form digitizer |
