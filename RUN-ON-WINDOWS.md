# IMG CRM (Jordan) — Run on a Windows server (no Docker)

The CRM is a Node.js app + one SQLite file, so it runs directly on Windows with
just Node installed. No Docker needed. Do these once on the **office server**
(the always-on Windows machine your team will reach).

> Everything below is done **on that Windows server**, signed in as an
> administrator.

---

## 1. Install Node.js 22
- Go to **https://nodejs.org** → download the **LTS** installer (must be
  **version 22 or newer** — the app needs Node's built-in SQLite).
- Run it, click Next through the defaults, Finish.
- Check it worked: open **Command Prompt** and run `node -v` — it should print
  `v22.x` (or higher).

## 2. Copy the CRM onto the server
Put the `jordan-crm` folder on the server, e.g. `C:\apps\jordan-crm`.
- You do **not** need the `node_modules` folder (step 4 rebuilds it) — skip it to
  copy faster.

## 3. Create the data folders (these hold everything, keep them safe)
Create two folders:
```
C:\crm-data       ← the database (crm.db) lives here
C:\crm-uploads    ← uploaded pricelist files live here
```

## 4. Set the configuration
In `C:\apps\jordan-crm`, open the **`.env`** file in Notepad and set it to:
```
PORT=4000
JWT_SECRET=replace-with-a-long-random-string
DB_PATH=C:\crm-data\crm.db
UPLOADS_PATH=C:\crm-uploads
IMI_PORTAL_URL=http://192.168.68.53:3000
```
Save it. (If there's no `.env`, copy `.env.example` to `.env` and edit that.)

## 5. Install the app's parts
Open **Command Prompt**, then:
```
cd C:\apps\jordan-crm
npm install
```
(Takes a minute or two the first time.)

## 6. Get a database — pick ONE
**A) Fresh start** (no existing data): create the starter database once:
```
npm run seed
```
**B) Move your existing data from the NAS** (keep all current deals/pricelists):
- On the NAS, make a safe copy: `docker-compose exec -T img-crm npm run backup`
  → grab the newest file from `/volume1/Projects/crm-data/backups/`.
- Copy that file to the server as **`C:\crm-data\crm.db`** (rename it to exactly
  `crm.db`). Also copy the NAS `crm-uploads` contents into `C:\crm-uploads`.
- Do **NOT** run `npm run seed` in this case.

## 7. Start it and test
```
npm start
```
You should see `✅  IMG CRM is running`. Leave that window open and test:
- On the server: open `http://localhost:4000/pipeline-v3/Pipeline.html`
- From another PC on the network: `http://<SERVER-IP>:4000/pipeline-v3/Pipeline.html`
  (find `<SERVER-IP>` by running `ipconfig` on the server — the IPv4 Address.)

If another PC can't reach it, do step 8.

## 8. Open the firewall (port 4000)
On the server: **Windows Defender Firewall → Advanced settings → Inbound Rules →
New Rule → Port → TCP → 4000 → Allow → Domain/Private** → name it "IMG CRM".

## 9. Make it always-on (auto-start, survives reboots)
`npm start` stops when you close the window or the server reboots. Make it a
proper background service so it stays up:

**Recommended — NSSM (a tiny free service tool):**
1. Download NSSM from **https://nssm.cc/download**, unzip, and open Command
   Prompt in its `win64` folder.
2. Install the service (point it at Node + the app):
   ```
   nssm install IMG-CRM "C:\Program Files\nodejs\node.exe" server.js
   nssm set IMG-CRM AppDirectory C:\apps\jordan-crm
   nssm set IMG-CRM Start SERVICE_AUTO_START
   nssm start IMG-CRM
   ```
3. It now runs in the background and restarts automatically after a reboot or a
   crash. Manage it with `nssm start/stop/restart IMG-CRM`, or in
   **services.msc** (look for "IMG-CRM").

*(No-download alternative: Windows **Task Scheduler** → new task → trigger "At
startup", action: run `C:\Program Files\nodejs\node.exe` with argument
`server.js`, "Start in" `C:\apps\jordan-crm`, and tick "Run whether user is
logged on or not". NSSM is sturdier because it also restarts on a crash.)*

## 10. Give the server a fixed IP
So the address never changes on your team, set a **static IP** on the server (in
its network adapter settings, or a DHCP reservation on your router). Then share
the one link: `http://<SERVER-IP>:4000/pipeline-v3/Pipeline.html`.

---

## Backups on this server
The same backup tool works here. Make one anytime:
```
cd C:\apps\jordan-crm
npm run backup
```
Backups land in `C:\crm-data\backups\`. To automate: **Task Scheduler** → daily
task at ~02:00 → action: run `C:\Program Files\nodejs\npm.cmd` with argument
`run backup`, "Start in" `C:\apps\jordan-crm`. Then, as in `BACKUP.md`, keep a
copy **off this server** (another drive / cloud). See `BACKUP.md` for details.

## Updating after code changes ("redeploying")
1. Copy the changed files into `C:\apps\jordan-crm` (overwrite).
2. If dependencies changed, run `npm install` again.
3. Restart the service: `nssm restart IMG-CRM` (or restart it in services.msc).
Your `C:\crm-data` and `C:\crm-uploads` are separate, so updating never touches
your data.

---

## Important: keep it on the office network only
The CRM currently uses a **demo login** (no real password checking) — fine on a
trusted internal network, but do **not** expose port 4000 to the internet as-is.
If you ever need outside access, we should turn on real logins and HTTPS first.

*IMG CRM · Izzat Marji Group Jordan · Internal Use Only*
