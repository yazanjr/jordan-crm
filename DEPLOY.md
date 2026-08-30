# IMG CRM (Jordan) — Deploy to the Synology NAS

Same approach as the IMI Project Portal (Docker + Container Manager), just on
**port 4000** instead of 3000, so the two can run side by side on the NAS.

- NAS address: `192.168.68.53`
- App URL after deploy: **http://192.168.68.53:4000/pipeline-v3/Pipeline.html**
- The database is a single SQLite file kept on the NAS (survives rebuilds).

---

## What's different from the IMI portal
- The CRM stores everything in a **SQLite database file** (`crm.db`), not `users.json`.
- That file (and uploaded pricelists) live in **NAS folders you create**, mounted into the container — so nothing is lost when you rebuild.
- Runs on **port 4000**.

---

## Step 1 — Upload the project to the NAS
Copy the entire `jordan-crm/` folder to the NAS. Suggested path:
```
/volume1/Projects/jordan-crm/
```
Use **Synology Drive**, **File Station** (drag & drop), or SSH/SCP.
> You do NOT need to copy `node_modules` — Docker rebuilds it. (It's ignored anyway.)

## Step 2 — Create the two data folders on the NAS
In **File Station**, create:
```
/volume1/Projects/crm-data/       ← the database (crm.db) lives here
/volume1/Projects/crm-uploads/    ← uploaded pricelist files live here
```
These match the `volumes:` lines in `docker-compose.yml`.

## Step 3 — Set a real secret
Open `jordan-crm/docker-compose.yml` and change:
```
- JWT_SECRET=CHANGE_ME_to_a_long_random_secret_string
```
to a long random string. (It's not heavily used today because login is in demo
mode, but set it now so it's ready when real login is turned on.)

## Step 4 — Make sure Container Manager (Docker) is installed
Package Center → **Container Manager** (or **Docker** on older DSM). You already
have this from the IMI portal.

## Step 5 — SSH into the NAS
```bash
ssh admin@192.168.68.53
```
(Enable SSH in DSM: Control Panel → Terminal & SNMP → Enable SSH, if needed.)

## Step 6 — Build and start
```bash
cd /volume1/Projects/jordan-crm

# Build the image (first time takes a couple of minutes)
docker-compose build

# Seed the database ONCE — creates users, roles, permissions and settings.
# (Without this the app has no users/roles to work with.)
docker-compose run --rm img-crm npm run seed

# Start it in the background
docker-compose up -d

# Check it started
docker-compose logs
```
You should see:
```
✅  SQLite ready: /app/data/crm.db
✅  IMG CRM is running
    Local  : http://localhost:4000
```

## Step 7 — Open it
From any PC on the company network:
```
http://192.168.68.53:4000/pipeline-v3/Pipeline.html
```
> If it doesn't load, allow port 4000: DSM → Control Panel → Security → Firewall.

---

## Managing the container
```bash
docker-compose down                 # stop
docker-compose up -d                # start
docker-compose up -d --build        # rebuild after code changes, then start
docker-compose logs -f              # watch live logs
docker ps                           # list running containers
```

## Updating after code changes
1. Upload the changed files to `/volume1/Projects/jordan-crm/` (or `git pull` if you clone the repo there).
2. `docker-compose up -d --build`

The database and uploads are on the mounted NAS folders, so **rebuilding never loses data.**

---

## About launch data (important)
The seed in Step 6 also creates some **sample deals** (via the design seed on
first start) so the app isn't empty. For a real launch you'll want a **clean
slate** — only your real staff accounts and real pricelist, no sample deals.
Ask Claude for the "clean-slate" setup when you're ready to go live; until then
the sample data is harmless and useful for testing.

## Backups
The whole database is one file: `/volume1/Projects/crm-data/crm.db`.
Back it up with Synology **Hyper Backup**, or a scheduled copy, so you can restore instantly.

---

## Troubleshooting
| Problem | Fix |
|---|---|
| Can't reach `192.168.68.53:4000` | Allow port 4000 in DSM Firewall |
| Blank page / login screen at the root | Use the full URL ending in `/pipeline-v3/Pipeline.html` |
| Container won't start | `docker-compose logs` to see the error |
| Pricelist upload fails | Rebuild (`--build`) so `xlsx` installs; confirm `/app/uploads` volume is mounted |
| Data disappeared after rebuild | Check the `volumes:` paths match the NAS folders you created |

---
*IMG CRM · Izzat Marji Group Jordan · Internal Use Only*
