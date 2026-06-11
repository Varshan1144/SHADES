from dotenv import load_dotenv
load_dotenv()  # Must be first — loads ANTHROPIC_API_KEY before Anthropic client is initialized

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
from recommender import (
    filter_database,
    get_recommendation,
    get_fallback_recommendation,
    classify_face_shape,
)

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
    confidence: Optional[Dict[str, float]] = None
    image_base64: Optional[str] = None


@app.post("/recommend")
async def recommend(req: RecommendRequest):
    # TESTING ONLY — API key check skipped while Claude is disabled
    # if not os.getenv("ANTHROPIC_API_KEY"):
    #     raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not configured")

    # Prefer PyTorch model when an image frame is provided
    if req.image_base64:
        try:
            result = classify_face_shape(req.image_base64)
            face_shape = result["face_shape"]
            confidence = result["confidence"]
            classifier = "pytorch"
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Classification error: {str(e)}")
    else:
        face_shape = req.face_shape
        confidence = req.confidence or {}
        classifier = "mediapipe"

    candidates = filter_database(
        face_shape, req.budget_min, req.budget_max, req.style, req.material
    )

    # TESTING ONLY — Claude API disabled; skip get_recommendation() and get_fallback_recommendation()
    # to avoid spending API credits while validating PyTorch classifier output.
    # Restore the try/except block below and remove this return to re-enable Claude.
    return {
        "face_shape": face_shape,
        "confidence": confidence,
        "candidates": candidates,
        "explanation": "Claude API disabled for testing",
        "source": "database" if candidates else "ai_search",
        "classifier": classifier,
    }
    # END TESTING ONLY

    preferences = {
        "budget_min": req.budget_min,
        "budget_max": req.budget_max,
        "style": req.style,
        "material": req.material,
    }

    try:
        if candidates:
            explanation = get_recommendation(face_shape, req.ratios, preferences, candidates)
            source = "database"
        else:
            print("[API] No DB results — falling back to Claude AI suggestions", flush=True)
            explanation = get_fallback_recommendation(face_shape, req.ratios, preferences)
            source = "ai_search"
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")

    return {
        "face_shape": face_shape,
        "confidence": confidence,
        "candidates": candidates,
        "explanation": explanation,
        "source": source,
        "classifier": classifier,
    }
