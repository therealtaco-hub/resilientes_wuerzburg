# Deployment Quick Start

**TL;DR:** Backend auf Render, Frontend auf Vercel, beide kostenlos.

---

## Reihenfolge

### Phase 1: Vorbereitung (5 min)

```bash
# 1. Git aktuell halten
git status
git add .
git commit -m "Prepare for deployment"
git push

# 2. .env-Beispiel prüfen
cat frontend/.env.example
# Sollte enthalten: VITE_API_URL=...

# 3. Backend-Requirements aktuell
cd backend
pip freeze > requirements.txt
cd ..
git add backend/requirements.txt
git commit -m "Update requirements"
git push
```

---

### Phase 2: Backend auf Render (10 min)

**Siehe:** [DEPLOY-RENDER.md](./DEPLOY-RENDER.md)

**Kurz:**
1. Render.com Account (mit GitHub)
2. Neuer Web Service
3. GitHub Repo verbinden
4. Build Command: `cd backend && pip install -r requirements.txt`
5. Start Command: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000`
6. Env Vars: `GEE_PROJECT_ID=<dein-id>` + `CORS_ORIGINS=http://localhost:5173` (erst später Vercel-URL)
7. Deploy
8. Warte auf grüner Status + kopiere URL (z.B. `https://resilientes-backend.onrender.com`)
9. Teste: `curl https://resilientes-backend.onrender.com/docs`

---

### Phase 3: Frontend auf Vercel (10 min)

**Siehe:** [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)

**Kurz:**
1. Vercel.com Account (mit GitHub)
2. New Project
3. GitHub Repo auswählen
4. Root Directory: `./frontend`
5. Env Vars: `VITE_API_URL=https://resilientes-backend.onrender.com` (die URL aus Phase 2)
6. Deploy
7. Warte auf grüner Status + kopiere URL (z.B. `https://resilientes-frontend.vercel.app`)

---

### Phase 4: CORS korrigieren (2 min)

Backend muss wissen, dass Frontend jetzt live ist.

1. Render Dashboard → **resilientes-backend** → **Environment**
2. Ändere `CORS_ORIGINS`:
   ```
   CORS_ORIGINS=https://resilientes-frontend.vercel.app,http://localhost:5173
   ```
3. Save → Render redeploy automatisch

---

### Phase 5: Test (5 min)

1. Öffne https://resilientes-frontend.vercel.app
2. DevTools öffnen (F12)
3. **Network** Tab → schaue auf API-Calls
4. Sollten zu `https://resilientes-backend.onrender.com/api/*` gehen
5. Keine Fehler? **✅ Fertig!**

---

## Datendateien-Problem

Dein Backend braucht:
- `backend/data/lst_wue_2023_2025_summer_median.tif` (LST-Daten)
- `backend/data/baumkataster_stadt_wuerzburg.parquet` (Baumkataster)
- Rest werden on-demand gebaut

**Lösungen:**

**Option A: In Git committen (schnell)**
```bash
git add backend/data/*.parquet backend/data/*.tif
git commit -m "Add data files"
git push
```

**Option B: On-Demand downloaden (sauberer)**
- Siehe Section 4 in [DEPLOY-RENDER.md](./DEPLOY-RENDER.md)
- Braucht externe Datei-Speicherung (z.B. Google Drive, S3)

**Empfehlung:** Startet mit A, wenn Dateien < 100 MB.

---

## Lokales Testen vorher

Bevor ihr deployed:

```bash
# Terminal 1
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

Browser: http://localhost:5173

Sollte laufen ohne Fehler.

---

## Häufige Fehler

| Fehler | Lösung |
|---|---|
| **404 auf /api/trees** | Render-Backend startet noch (2–3 min) oder Datendatei fehlt. Logs checken. |
| **CORS error im Browser** | `CORS_ORIGINS` in Render nicht aktualisiert. Dashboard checken. |
| **API_URL zeigt auf localhost** | Vercel Env Var `VITE_API_URL` nicht gesetzt. Vercel Project Settings prüfen. |
| **Deps-Fehler beim Build** | `npm install` war unvollständig. `package-lock.json` checken. |

---

## Nach dem Deploy

Bei jedem `git push main` deployen beide Services automatisch:

```bash
git add .
git commit -m "Feature: xyz"
git push origin main
# → Render & Vercel starten automatisch Deployment
```

Monitor:
- **Backend:** https://dashboard.render.com
- **Frontend:** https://vercel.com/dashboard

---

## Troubleshooting-Links

- Render Logs: https://dashboard.render.com → resilientes-backend → **Logs** Tab
- Vercel Logs: https://vercel.com/dashboard/resilientes-frontend → **Deployments** → Latest → **Logs**

---

**Los geht's! 🚀**
