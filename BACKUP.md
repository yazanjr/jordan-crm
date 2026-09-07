# IMG CRM (Jordan) — Backups

The entire CRM lives in **one SQLite file**: `crm.db`. Uploaded pricelist files
live in a second folder. On the NAS:

| What | NAS path (host) | In the container |
|---|---|---|
| Database | `/volume1/Projects/crm-data/crm.db` | `/app/data/crm.db` |
| Uploaded files | `/volume1/Projects/crm-uploads/` | `/app/uploads/` |

> **Golden rule:** never back up `crm.db` with a plain copy while the app is
> running — a copy can catch a half-written change and be corrupt. Use the
> backup script below (SQLite `VACUUM INTO`), which makes a *consistent* copy
> even while people are using the CRM.

---

## Two layers (do both)

**Layer 1 — automatic on-NAS snapshots** (fast to make, fast to restore).
A scheduled script makes a clean, timestamped copy of `crm.db` into
`/volume1/Projects/crm-data/backups/` and keeps the most recent 30.

**Layer 2 — off-device copy** (survives a NAS disk failure, theft, ransomware).
Synology **Hyper Backup** copies the `crm-data` folder (which now *includes* the
snapshots) and `crm-uploads` to another disk / USB / cloud.

A backup that never leaves the NAS is not a real backup. Layer 2 is the one that
saves you if the NAS itself dies.

---

## Layer 1 — the backup script

Built in: `scripts/backup-db.js` (run with `npm run backup`). It opens the DB
read-only, runs `VACUUM INTO` to `data/backups/crm-<date>_<time>.db`, verifies
the copy opens and has data, then keeps the newest `BACKUP_KEEP` (default 30).

### Run it once, right now (manual backup)
On the NAS, from the project folder:
```bash
cd /volume1/Projects/jordan-crm
docker-compose exec -T img-crm npm run backup
```
You'll see `✅ Backup written: /app/data/backups/crm-….db`. The file appears on
the NAS at `/volume1/Projects/crm-data/backups/` (open it in File Station).

> Tip: run this manually **before** any risky change (a redeploy, a big import,
> a mass pricelist edit).

### Schedule it (daily, automatic)
DSM → **Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script**.
- **User:** `root`
- **Schedule:** daily, e.g. 02:00 (a quiet time)
- **Run command:**
```bash
cd /volume1/Projects/jordan-crm && docker-compose exec -T img-crm npm run backup
```
Save. Then select the task → **Run** once to test it, and check that a new file
appears in `/volume1/Projects/crm-data/backups/`.

> If the task errors with "docker-compose: not found", use the full path
> (often `/usr/local/bin/docker-compose …`), or the equivalent
> `docker exec -T $(docker ps -qf name=img-crm) npm run backup`.

Keep more/fewer copies by setting `BACKUP_KEEP` in `docker-compose.yml`
(e.g. `- BACKUP_KEEP=60`).

---

## Layer 2 — Hyper Backup (off the NAS)

DSM → **Hyper Backup** → create a task that backs up **both**:
- `/volume1/Projects/crm-data`  (database + the Layer-1 snapshots)
- `/volume1/Projects/crm-uploads`  (uploaded files)

to a destination on a **different disk** — an external USB drive, another NAS, or
a cloud target (C2 / Google Drive / S3, etc.). Schedule it daily and enable
versioning so you can go back several days. (Synology **Btrfs snapshots** on the
`Projects` shared folder are a nice instant-restore extra, but they stay on the
same NAS, so they are not a substitute for Hyper Backup.)

---

## Restoring from a backup

1. Pick the backup file you want from `/volume1/Projects/crm-data/backups/`
   (or from your Hyper Backup destination).
2. Stop the app so nothing is writing:
   ```bash
   cd /volume1/Projects/jordan-crm && docker-compose down
   ```
3. Replace the live database (keep the current one aside first, just in case):
   ```bash
   cd /volume1/Projects/crm-data
   mv crm.db crm.db.replaced-$(date +%F_%H%M%S)
   cp backups/crm-YYYY-MM-DD_HHMMSS.db crm.db
   ```
4. Start again:
   ```bash
   cd /volume1/Projects/jordan-crm && docker-compose up -d
   ```
5. Open the CRM and confirm the data is what you expect.

> To just *inspect* a backup without touching the live system, copy it to your
> PC and open it with **DB Browser for SQLite** (free).

---

## Quick reference
```bash
# Back up now
cd /volume1/Projects/jordan-crm && docker-compose exec -T img-crm npm run backup

# See the backups on the NAS
ls -lh /volume1/Projects/crm-data/backups/
```

*IMG CRM · Izzat Marji Group Jordan · keep at least one backup OFF the NAS.*
