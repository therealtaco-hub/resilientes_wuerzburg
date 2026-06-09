# Backend auf Render hosten – Step-by-Step

## 🎯 Ziel
FastAPI-Backend läuft auf Render.com (kostenlos), ist über öffentliche URL erreichbar, und hat Zugriff auf die Datendateien (`backend/data/`).

---

## Schritt 1: Render-Account erstellen

1. Gehe zu https://render.com
2. Klicke oben rechts **Sign up**
3. Wähle **Sign up with GitHub** (einfacher, da wir sowieso GitHub brauchen)
4. Autorisiere Render auf deinem GitHub-Account
5. Bestätige deine E-Mail

---

## Schritt 2: GitHub-Repo vorbereiten

### 2.1 `backend/data/` in `.gitignore` prüfen

Öffne `.gitignore` und stelle sicher, dass **Parquet und TIF ausgeschlossen** sind:

```gitignore
*.parquet
*.tif
*.tiff
*.gdb/
```

So verhindert ihr, dass große Binärdateien ins Repo gelangen.

### 2.2 Placeholder für Datendateien erstellen

Render muss irgendwie an die Datendateien kommen. Ihr habt zwei Optionen:

**Option A: Dateien im Repo (schnell, aber schwer wenn > 50 MB)**
- `.gitignore` anpassen: `*.parquet` und `*.tif` herausnehmen
- Dateien committen:
  ```bash
  git add backend/data/*.parquet backend/data/*.tif
  git commit -m "Add cached data files for Render"
  ```

**Option B: On-Demand-Download im Backend (empfohlen)**
- Dateien bleiben raus aus Git
- Backend baut sie beim Start selbst, oder lädt sie herunter
- Später mehr dazu (Schritt 4)

### 2.3 Python-Dependencies aktuell halten

Stelle sicher, `backend/requirements.txt` ist up-to-date:

```bash
cd backend
pip freeze > requirements.txt
```

Committen:
```bash
git add requirements.txt
git commit -m "Update requirements"
```

---

## Schritt 3: Web Service auf Render erstellen

### 3.1 Dashboard aufrufen

1. Gehe zu https://dashboard.render.com
2. Klicke **New +** → **Web Service**

### 3.2 GitHub-Repo verbinden

1. **Connect a repository**: Wähle dein `resilientes-wuerzburg` Repo
2. Klicke **Connect**

Falls Render das Repo nicht findet:
- Gehe zu GitHub Settings → Apps & integrations → Render
- Klicke **Configure** → wähle das Repo aus

### 3.3 Web Service konfigurieren

| Feld | Wert |
|---|---|
| **Name** | `resilientes-backend` |
| **Environment** | `Python 3` |
| **Region** | `Frankfurt (eu-central-1)` oder nächste zu dir |
| **Branch** | `main` |
| **Build Command** | `cd backend && pip install -r requirements.txt` |
| **Start Command** | `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000` |

### 3.4 Umgebungsvariablen setzen

Scrolle runter zu **Environment**. Füge hinzu:

```
GEE_PROJECT_ID=<dein Google Earth Engine Projekt>
CORS_ORIGINS=https://resilientes-frontend.vercel.app,http://localhost:5173
```

(Die Vercel-URL ist jetzt noch ein Platzhalter — wird später aktualisiert, wenn Frontend deployed ist.)

### 3.5 Deploy starten

1. Klicke **Create Web Service**
2. Warte ~2–3 Minuten
3. Du siehst Logs im **Logs**-Tab
4. Wenn erfolgreich: grüner Status + URL wie `https://resilientes-backend.onrender.com`

---

## Schritt 4: Datendateien auf Render

Jetzt kommt der knifflige Part: Wie kommen `backend/data/*.parquet` und `backend/data/*.tif` auf Render?

### Option A: In `.gitignore` entsperren + committen (schnell)

Wenn eure Dateien < 100 MB sind:

1. Öffne `.gitignore`, kommentiere aus:
   ```gitignore
   # *.parquet
   # *.tif
   ```

2. Committen:
   ```bash
   git add backend/data/
   git commit -m "Add data files for production"
   git push
   ```

3. Render redeploy: Im Render Dashboard → **Manual Deploy** → **Deploy latest commit**

**Vorteil:** Einfach, sicher  
**Nachteil:** Repo wird schwer, langsame Pushes

### Option B: On-Demand-Generierung im Backend (sauberer)

Nutzt die `load_*`-Funktionen, um Dateien beim Start zu erzeugen:

**backend/data_init.py** (neu):
```python
import os
import sys
from pathlib import Path

# Versuche, fehlende Dateien zu bauen
sys.path.insert(0, str(Path(__file__).parent))

from utils.data_loader import (
    load_tree_cadastre,
    load_zensus,
    load_lst,
    load_entsiegelung,
    load_stadtbezirke
)

def init_data():
    """Beim Backend-Start: fehlende Caches aufbauen."""
    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)
    
    print("[INIT] Checking data files...")
    
    # Zensus (aus CSV parsbar)
    if not (data_dir / "zensus.parquet").exists():
        print("[INIT] Building zensus.parquet...")
        load_zensus(force_refresh=True)
    
    # LST (braucht .tif-Quelldatei)
    if not (data_dir / "lst.parquet").exists():
        print("[INIT] Building lst.parquet...")
        try:
            load_lst(force_refresh=True)
        except FileNotFoundError:
            print("[WARN] lst_wue_2023_2025_summer_median.tif nicht gefunden – LST-Endpoint wird fehlschlagen")
    
    # Baumkataster (braucht .parquet-Quelldatei)
    if not (data_dir / "trees.parquet").exists():
        print("[INIT] Building trees.parquet...")
        try:
            load_tree_cadastre(force_refresh=True)
        except FileNotFoundError:
            print("[WARN] baumkataster_stadt_wuerzburg.parquet nicht gefunden – Trees-Endpoint wird fehlschlagen")
    
    # Entsiegelung (braucht ATKIS-ZIP)
    if not (data_dir / "entsiegelung.parquet").exists():
        print("[INIT] Building entsiegelung.parquet...")
        try:
            load_entsiegelung(force_refresh=True)
        except Exception as e:
            print(f"[WARN] Entsiegelung konnte nicht geladen werden: {e}")
    
    # Stadtbezirke (lädt live von API, cached aber)
    if not (data_dir / "stadtbezirke.parquet").exists():
        print("[INIT] Building stadtbezirke.parquet...")
        try:
            load_stadtbezirke(force_refresh=True)
        except Exception as e:
            print(f"[WARN] Stadtbezirke konnte nicht geladen werden: {e}")
    
    print("[INIT] Data initialization complete!")

if __name__ == "__main__":
    init_data()
```

**backend/main.py** anpassen (oben):
```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Data init beim Startup
from data_init import init_data
init_data()

app = FastAPI()

# CORS, Router, etc...
```

**Start Command auf Render** anpassen:
```
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

Der `init_data()`-Call passiert automatisch vor der ersten Request.

**Problem:** Das funktioniert nur für Dateien, die aus vorhandenen Quellen (CSVs, APIs) gebaut werden. Für `baumkataster_stadt_wuerzburg.parquet` und `lst_wue_*.tif` braucht ihr:

### Option B.2: Quelldateien von externer URL downloaden

Wenn ihr die `.tif` und `.parquet`-Quelldateien irgendwo hostet (z. B. Google Drive, AWS S3), könnt ihr sie im Backend downloaden:

**backend/data_init.py** erweitern:
```python
import urllib.request

def download_file(url: str, target_path: Path) -> bool:
    """Download file if not exists."""
    if target_path.exists():
        print(f"[INIT] {target_path.name} already exists, skipping download")
        return True
    
    try:
        print(f"[INIT] Downloading {target_path.name} from {url}...")
        urllib.request.urlretrieve(url, target_path)
        print(f"[INIT] ✓ Downloaded {target_path.name}")
        return True
    except Exception as e:
        print(f"[WARN] Failed to download {target_path.name}: {e}")
        return False

# In init_data():
download_file(
    url="https://your-storage.example.com/lst_wue_2023_2025_summer_median.tif",
    target_path=data_dir / "lst_wue_2023_2025_summer_median.tif"
)
download_file(
    url="https://your-storage.example.com/baumkataster_stadt_wuerzburg.parquet",
    target_path=data_dir / "baumkataster_stadt_wuerzburg.parquet"
)
```

**Tipps:**
- Google Drive Share-Link umwandeln: `https://drive.google.com/uc?export=download&id=FILE_ID`
- AWS S3 Pre-Signed URLs sind praktisch (zeitlich begrenzt)
- Render gibt Free-Tier-Instances ~30 min zum Boot, downloads sollten passen

---

## Schritt 5: CORS-Origin aktualisieren

Sobald dein Frontend auf Vercel deployed ist (Schritt 3 im Vercel-Guide), update die Umgebungsvariable:

1. Render Dashboard → **resilientes-backend** → **Environment**
2. Ändere `CORS_ORIGINS`:
   ```
   CORS_ORIGINS=https://resilientes-frontend.vercel.app,http://localhost:5173
   ```
3. Speichern → Auto-Redeploy

---

## Schritt 6: Health Check

Teste die API manuell:

```bash
# Backend-Health
curl https://resilientes-backend.onrender.com/docs

# Beispiel-Endpoint
curl https://resilientes-backend.onrender.com/api/trees?limit=1
```

Solltest ein Swagger-UI + GeoJSON sehen.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| **503 Service Unavailable** | Backend startet noch (erste 2–3 min). Warten oder Logs checken. |
| **ModuleNotFoundError** | `requirements.txt` nicht aktuell. → `pip freeze > requirements.txt` + push + redeploy. |
| **FileNotFoundError: lst_wue_...tif** | Datei liegt nicht in `backend/data/`. → Option B.2 nutzen oder `git add` + push. |
| **CORS Error im Frontend** | `CORS_ORIGINS` Umgebungsvariable ist falsch. → Render Dashboard aktualisieren. |
| **Timeout beim Deploy** | Dependencies zu groß? Render-Limits checken. Großdateien auslagern. |

---

## Fortgeschritten: Auto-Redeploy bei Git Push

Render deployed automatisch, wenn du in `main` pushst (Standard). Wenn du das nicht willst:

Render Dashboard → **Settings** → **Auto-Deploy** → **Disabled**

---

## Checklist

- [ ] Render-Account erstellt
- [ ] GitHub-Repo mit Render verbunden
- [ ] Web Service erstellt
- [ ] Umgebungsvariablen gesetzt (GEE_PROJECT_ID, CORS_ORIGINS)
- [ ] Datendateien auf Render (Option A oder B)
- [ ] Backend deployed, Health Check erfolgreich
- [ ] CORS_ORIGINS mit Vercel-URL aktualisiert (später)

---

**Nächster Schritt:** [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)
