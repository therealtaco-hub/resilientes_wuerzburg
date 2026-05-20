"""
GET /api/simulate/* — Simulationsendpoints (noch nicht implementiert).

Geplant:
  /api/simulate/baeume  → Neupflanzungen → Δ°C + CO₂-Bindung
  /api/simulate/wasser  → Entsiegelungsfläche → m³ Versickerung/Jahr (Rational-Formel)
Formeln und Koeffizienten werden vom Projektinhaber vorgegeben.
"""

from fastapi import APIRouter

router = APIRouter()
