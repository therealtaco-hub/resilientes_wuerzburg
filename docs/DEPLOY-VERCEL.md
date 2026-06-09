# Frontend auf Vercel hosten – Step-by-Step

## 🎯 Ziel
React + Vite Frontend läuft auf Vercel.com (kostenlos) und kommuniziert mit dem Render-Backend.

---

## Schritt 1: Vercel-Account erstellen

1. Gehe zu https://vercel.com
2. Klicke **Sign up**
3. Wähle **Continue with GitHub** (einfacher)
4. Autorisiere Vercel auf deinem GitHub-Account
5. Fertig – du bist angemeldet

---

## Schritt 2: GitHub-Repo vorbereiten

### 2.1 Frontend-Ordner-Struktur checken

Stelle sicher, dass das Frontend im Root liegt:
```
resilientes-wuerzburg/
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   └── ...
├── backend/
├── CLAUDE.md
└── ...
```

### 2.2 `.env.example` für Vercel erstellen

Erstelle `frontend/.env.example` mit allen erforderlichen Umgebungsvariablen:

```
VITE_API_URL=https://resilientes-backend.onrender.com
```

**Wichtig:** Das ist nur ein Beispiel. Die echte URL wird im Vercel-Dashboard gesetzt.

### 2.3 `package.json` prüfen

Öffne `frontend/package.json`:

```json
{
  "name": "resilientes-wuerzburg",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "vite": "^5.x",
    ...
  }
}
```

Wichtig: **Keine `"start"` oder `"serve"`** — Vercel verwendet automatisch `npm run build`.

### 2.4 `vite.config.js` prüfen

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
```

**Wichtig:** Keine explizite `host: '0.0.0.0'` nötig für Vercel.

---

## Schritt 3: Import von `.env` in Vite prüfen

Dein React-Code muss `import.meta.env.VITE_API_URL` nutzen. Beispiel aus `frontend/src/api/client.js`:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  // ...
}
```

Falls `VITE_API_URL` nicht gesetzt, fällt es auf Localhost zurück (nützlich zum lokalen testen).

---

## Schritt 4: Vercel Projekt erstellen

### 4.1 Dashboard aufrufen

1. Gehe zu https://vercel.com/dashboard
2. Klicke **Add New** → **Project**

### 4.2 GitHub-Repo verbinden

1. **Import Git Repository**: Wähle `resilientes-wuerzburg`
2. Klicke **Import**

Falls dein Repo nicht angezeigt wird:
- GitHub-Integration überprüfen: https://github.com/settings/installations
- Klicke Vercel → **Configure** → wähle das Repo aus

### 4.3 Projekt konfigurieren

| Feld | Wert |
|---|---|
| **Project Name** | `resilientes-frontend` |
| **Framework Preset** | `Vite` |
| **Root Directory** | `./frontend` (wichtig!) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 4.4 Umgebungsvariablen setzen

Scrolle zu **Environment Variables**. Füge hinzu:

```
VITE_API_URL = https://resilientes-backend.onrender.com
```

(Diese URL nutzt die Render-URL aus Schritt 3 des Render-Guides.)

### 4.5 Deploy starten

1. Klicke **Deploy**
2. Warte ~2–3 Minuten auf den Build
3. Wenn erfolgreich: **Congratulations!** + URL wie `https://resilientes-frontend.vercel.app`

---

## Schritt 5: Backend CORS aktualisieren

Sobald Frontend deployed ist:

1. Gehe zu Render Dashboard
2. **resilientes-backend** → **Environment**
3. Ändere `CORS_ORIGINS`:
   ```
   CORS_ORIGINS=https://resilientes-frontend.vercel.app,http://localhost:5173
   ```
4. Speichern → Auto-Redeploy

---

## Schritt 6: Test

Öffne https://resilientes-frontend.vercel.app im Browser.

Prüfe:
- ✅ Seite lädt
- ✅ Karte erscheint
- ✅ Daten in Console (DevTools F12 → **Network** Tab → API-Calls zu `resilientes-backend.onrender.com`)
- ✅ Keine CORS-Fehler

Falls CORS-Fehler:
```
Access to XMLHttpRequest at 'https://resilientes-backend.onrender.com...'
from origin 'https://resilientes-frontend.vercel.app' has been blocked
```

→ Backend CORS-Origin nicht aktualisiert. Render Dashboard nochmal checken.

---

## Schritt 7: Auto-Redeploy

Vercel deployed automatisch bei jedem Push auf `main` (Standard). 

Um zu disablen:
1. **Project Settings** → **Git**
2. **Deployments** → Disable automatic deployments from main

---

## Schritt 8 (Optional): Custom Domain

Falls ihr `resilientes-wuerzburg.de` registriert habt:

1. **Project Settings** → **Domains**
2. Klicke **Add** → gib Domain ein
3. Nameserver aktualisieren (Hinweise vom Domain-Registrar)
4. ~10 min warten

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| **Build fails: Cannot find module 'vite'** | `npm install` nicht durchgelaufen. Logs checken, Vercel redeploy. |
| **CORS error im Browser** | CORS_ORIGINS im Render-Backend nicht gesetzt. Render Dashboard checken + redeploy. |
| **Blank page, keine Fehler** | `VITE_API_URL` nicht gesetzt oder falsch. Vercel Env Vars checken. Browser Cache löschen (Ctrl+Shift+Del). |
| **API-Calls gehen ins Nirvana** | Frontend sendet zu falscher URL. DevTools → Network → prüfe Request-URL. |
| **Build zu lange (> 10 min)** | Dependencies zu groß? `npm list` prüfen, ungenutzte Pakete raus. |

---

## Fortgeschritten: Preview Deployments

Vercel erstellt automatisch Preview-Deploys für **jeden Pull Request**. Praktisch zum Testen vor dem Merge!

Siehe: https://vercel.com/docs/deployments/preview-deployments

---

## Checklist

- [ ] Vercel-Account erstellt
- [ ] GitHub-Repo mit Vercel verbunden
- [ ] Root Directory auf `./frontend` gesetzt
- [ ] `VITE_API_URL` Umgebungsvariable gesetzt
- [ ] Frontend deployed, URL notiert
- [ ] Backend CORS aktualisiert (mit Vercel-URL)
- [ ] Test im Browser: Keine Fehler, Daten laden

---

## Zusammenfassung: Backend + Frontend

| Service | URL | Status |
|---|---|---|
| **Backend (Render)** | `https://resilientes-backend.onrender.com` | ✅ Lädt Daten, gibt JSON zurück |
| **Frontend (Vercel)** | `https://resilientes-frontend.vercel.app` | ✅ Zeigt Karten & Charts |
| **GitHub** | `https://github.com/YOUR_USERNAME/resilientes-wuerzburg` | ✅ Source of Truth |

---

## Nächste Schritte

1. Bei jedem Push auf `main` deployen beide Services automatisch
2. Um lokale Änderungen zu testen:
   ```bash
   # Terminal 1: Backend
   cd backend && uvicorn main:app --reload --port 8000
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```
   Dann im Browser: http://localhost:5173

3. Frontend & Backend müssen auf unterschiedlichen Ports laufen (8000 vs 5173) — kein Problem, Vite proxy-config unterstützt das.

---

**Alles fertig! 🎉**
