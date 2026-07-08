"""
hit_endpoints.py — READ-ONLY endpoint health probe (curl-equivalent).

Pings every backend endpoint on a running server (default http://localhost:8000)
and reports HTTP status + feature/record count for each, then makes ONE sanity call
to /api/simulate/baeume and ONE to /api/simulate/wasser and prints their headline
outputs. Uses only the stdlib (urllib) — no extra deps.

READ-ONLY: issues GET requests only. It does not send ?refresh=true, so it will not
rebuild any cache; it just observes what the server already serves. It writes
nothing to disk.

Prerequisite: the backend must be running. Start it (see rw-run-and-operate):
    cd backend && C:/Users/Marvi/miniconda3/envs/resilientes/python.exe \
        -m uvicorn main:app --port 8000

Run (from anywhere):
    C:/Users/Marvi/miniconda3/envs/resilientes/python.exe \
        .claude/skills/rw-diagnostics-and-tooling/scripts/hit_endpoints.py

    # different host/port:
    ... hit_endpoints.py http://localhost:8000

Expected output shape (healthy backend, 2026-07-08):
    GET /                      200   status=ok
    GET /api/lst               200   features=~14500
    GET /api/zensus            200   features=~3089
    GET /api/trees             200   features=44647
    GET /api/vulnerability     200   features=(<= zensus)
    GET /api/entsiegelung      200   features=(atkis+osm, thousands)
    GET /api/stadtbezirke      200   features=13
    GET /api/hotspots          200   features=5
    GET /api/simulate/baeume   200   delta_lst_celsius=<neg> co2_kg_year=<..>
    GET /api/simulate/wasser   200   infiltration_m3_year=<..> retention_pct=<..>

Feature-count sanity ranges (deviation = investigate, don't panic):
    LST ~14,500 | Zensus ~3,089 | Trees 44,647 | Stadtbezirke 13 | Hotspots 5
"""

import json
import sys
import urllib.error
import urllib.request

# (path, query, expected-count hint). Count read from FeatureCollection.features
# or meta.count / meta.total_count when present.
_ENDPOINTS = [
    ("/",                 "", "status=ok"),
    ("/api/lst",          "", "~14500"),
    ("/api/zensus",       "", "~3089"),
    ("/api/trees",        "", "44647"),
    ("/api/vulnerability","", "<= zensus"),
    ("/api/entsiegelung", "", "atkis+osm (thousands)"),
    ("/api/stadtbezirke", "", "13"),
    ("/api/hotspots",     "", "5"),
]

# Sanity sim calls (params per GROUND_TRUTH §2 / routers/simulate.py).
_SIM_BAEUME = "/api/simulate/baeume?n_trees=10&area_m2=10000&existing_coverage_pct=0"
_SIM_WASSER = "/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface=rasendecke"


def _get(url, timeout=60):
    """GET url, return (status, parsed_json_or_text). Never raises for HTTP errors."""
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        status = e.code
    except Exception as e:  # connection refused, timeout, DNS...
        return None, str(e)
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, body


def _count(payload):
    """Best-effort feature/record count from a JSON payload."""
    if isinstance(payload, dict):
        if isinstance(payload.get("features"), list):
            return len(payload["features"])
        meta = payload.get("meta")
        if isinstance(meta, dict):
            for k in ("count", "total_count"):
                if k in meta:
                    return meta[k]
        if payload.get("status"):
            return f"status={payload['status']}"
    return "?"


def main(argv):
    base = argv[1].rstrip("/") if len(argv) > 1 else "http://localhost:8000"
    print(f"base: {base}")
    print()

    # First probe: is the server even up?
    status, payload = _get(f"{base}/")
    if status is None:
        print(f"[DOWN] cannot reach {base}/ : {payload}")
        print("  -> start the backend first (see rw-run-and-operate).")
        return 2

    any_fail = False
    for path, _q, hint in _ENDPOINTS:
        st, pl = _get(f"{base}{path}")
        if st is None:
            print(f"GET {path:<22} ERR   {pl}")
            any_fail = True
            continue
        cnt = _count(pl)
        flag = "" if st == 200 else "  <-- non-200"
        if st != 200:
            any_fail = True
        print(f"GET {path:<22} {st}   count={cnt:<8} (expect {hint}){flag}")

    # --- sanity sim calls --------------------------------------------------
    print()
    print("sanity simulations:")
    st, pl = _get(f"{base}{_SIM_BAEUME}")
    if st == 200 and isinstance(pl, dict):
        print(f"GET /api/simulate/baeume   200   "
              f"delta_lst_celsius={pl.get('delta_lst_celsius')}  "
              f"co2_kg_year={pl.get('co2_kg_year')}  "
              f"effective_new_pct={pl.get('effective_new_pct')}")
        if pl.get("delta_lst_celsius") is not None and pl["delta_lst_celsius"] > 0:
            print("  WARN: delta_lst_celsius should be <= 0 (cooling). Positive = suspect.")
    else:
        print(f"GET /api/simulate/baeume   {st}   {pl}")
        any_fail = True

    st, pl = _get(f"{base}{_SIM_WASSER}")
    if st == 200 and isinstance(pl, dict):
        print(f"GET /api/simulate/wasser   200   "
              f"infiltration_m3_year={pl.get('infiltration_m3_year')}  "
              f"retention_pct={pl.get('retention_pct')}  "
              f"context_persons={pl.get('context_persons')}")
    else:
        print(f"GET /api/simulate/wasser   {st}   {pl}")
        any_fail = True

    print()
    print("How to read this:")
    print("  * Counts far outside the hints = stale/rebuilt cache or swapped input")
    print("    file. LST ~14,500 / Zensus ~3,089 / Trees 44,647 / Bezirke 13 /")
    print("    Hotspots 5 are the healthy baselines (GROUND_TRUTH).")
    print("  * A 422 on /api/simulate/wasser means an unknown surface type — the")
    print("    endpoint validates from_surface/to_surface against RUNOFF_COEFFICIENTS.")
    print("  * First /api/lst after a cold start can take seconds (builds the cache).")
    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
