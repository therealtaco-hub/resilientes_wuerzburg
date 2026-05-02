"""
pytest-Konfiguration: stellt sicher, dass `backend/` im sys.path liegt,
damit `from main import app` und `from utils...` funktionieren.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
