from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from routers import trees, lst, simulate, zensus, vulnerability, entsiegelung, stadtbezirke

load_dotenv()

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(title="Resilientes Würzburg API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trees.router, prefix="/api/trees", tags=["trees"])
app.include_router(lst.router, prefix="/api/lst", tags=["lst"])
app.include_router(simulate.router, prefix="/api/simulate", tags=["simulate"])
app.include_router(zensus.router, prefix="/api/zensus", tags=["zensus"])
app.include_router(vulnerability.router, prefix="/api/vulnerability", tags=["vulnerability"])
app.include_router(entsiegelung.router, prefix="/api/entsiegelung", tags=["entsiegelung"])
app.include_router(stadtbezirke.router, prefix="/api/stadtbezirke", tags=["stadtbezirke"])


@app.get("/")
def root():
    return {"status": "ok", "project": "Resilientes Würzburg"}
