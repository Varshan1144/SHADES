from dotenv import load_dotenv
load_dotenv()  # Must be first — loads ANTHROPIC_API_KEY before Anthropic client is initialized

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
from recommender import filter_database, get_recommendation

app = FastAPI(title="SHADES API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    face_shape: str
    ratios: Dict[str, float]
    budget_min: float = 0
    budget_max: float = 10000
    style: Optional[str] = None
    material: Optional[str] = None


@app.post("/recommend")
async def recommend(req: RecommendRequest):
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not configured")

    candidates = filter_database(
        req.face_shape, req.budget_min, req.budget_max, req.style, req.material
    )
    if not candidates:
        raise HTTPException(
            status_code=404,
            detail="No sunglasses found — try broadening filters",
        )

    preferences = {
        "budget_min": req.budget_min,
        "budget_max": req.budget_max,
        "style": req.style,
        "material": req.material,
    }

    try:
        explanation = get_recommendation(req.face_shape, req.ratios, preferences, candidates)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")

    return {
        "face_shape": req.face_shape,
        "candidates": candidates,
        "explanation": explanation,
    }
