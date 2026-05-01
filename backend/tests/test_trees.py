"""
Manuell ausführbarer Integrationstest für GET /api/trees.

Ausführen:
    cd backend
    python -m pytest tests/test_trees.py -v
    # oder direkt:
    python tests/test_trees.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.mark.asyncio
async def test_trees_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/trees")

    assert response.status_code == 200, f"Erwartet 200, erhalten {response.status_code}"

    body = response.json()
    assert body.get("type") == "FeatureCollection", "Response muss type='FeatureCollection' haben"
    assert len(body.get("features", [])) > 0, "features darf nicht leer sein"

    print(f"OK – {len(body['features'])} Bäume geladen.")


if __name__ == "__main__":
    asyncio.run(test_trees_endpoint())
