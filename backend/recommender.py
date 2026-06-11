import base64
import io
import json
import os
from typing import Optional

import psycopg2
import psycopg2.extras
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from anthropic import Anthropic
from PIL import Image

# ─── PyTorch classifier (loaded once at startup) ──────────────────────────────
# fahd9999/face_shape_classification — EfficientNet, 85% accuracy.
# Class order matches inference.py: 0=Heart, 1=Oblong, 2=Oval, 3=Round, 4=Square

_MODEL_PATH = "/Users/varshanreddy/shades/models/face_shape_hf/model_85_nn_.pth"
_CLASS_LABELS = ["heart", "oblong", "oval", "round", "square"]

_transform = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

print("[PT] Loading PyTorch face shape classifier…", flush=True)
_model = torch.load(_MODEL_PATH, map_location="cpu", weights_only=False)
_model.eval()
print("[PT] Classifier ready", flush=True)


def classify_face_shape(image_base64: str) -> dict:
    image_bytes = base64.b64decode(image_base64)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = _transform(image).unsqueeze(0)  # (1, 3, 224, 224)

    with torch.inference_mode():
        logits = _model(tensor)
        probs = F.softmax(logits, dim=1)[0]  # shape (5,)

    scores = {label: float(probs[i]) for i, label in enumerate(_CLASS_LABELS)}

    # Largest-remainder normalisation → integer percentages summing to exactly 100
    total   = sum(scores.values()) or 1.0
    scaled  = {k: v / total * 100 for k, v in scores.items()}
    floored = {k: int(v) for k, v in scaled.items()}
    rem     = 100 - sum(floored.values())
    fracs   = sorted(scaled.items(), key=lambda x: x[1] % 1, reverse=True)
    for i in range(rem):
        floored[fracs[i][0]] += 1

    face_shape = max(scores, key=scores.get)
    print(f"[PT] classify → {face_shape} | {floored}", flush=True)
    # TESTING ONLY — full breakdown sorted by confidence
    sorted_conf = dict(sorted(floored.items(), key=lambda x: x[1], reverse=True))
    print(f"[PT] confidence breakdown: {sorted_conf}", flush=True)
    return {"face_shape": face_shape, "confidence": floored}


def filter_database(
    shape: str,
    budget_min: float,
    budget_max: float,
    style: Optional[str] = None,
    material: Optional[str] = None,
) -> list:
    params = {
        "shape": shape,
        "budget_min": float(budget_min),
        "budget_max": float(budget_max),
        "style": style,
        "material": material,
    }
    print(f"[DB] filter_database params: {params}", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, brand, model, style, price, face_shapes, material, link, image_url
                FROM sunglasses
                WHERE %(shape)s = ANY(face_shapes)
                  AND price >= %(budget_min)s::numeric
                  AND price <= %(budget_max)s::numeric
                  AND (%(style)s IS NULL OR style = %(style)s)
                  AND (%(material)s IS NULL OR material = %(material)s)
                ORDER BY price
                LIMIT 10
                """,
                params,
            )
            rows = cur.fetchall()
            print(f"[DB] query returned {len(rows)} rows", flush=True)
    finally:
        conn.close()

    result = []
    for row in rows:
        d = dict(row)
        d["price"] = int(d["price"])
        result.append(d)
    return result


def get_recommendation(
    face_shape: str,
    ratios: dict,
    preferences: dict,
    candidates: list,
) -> str:
    client = Anthropic()
    prompt = f"""You are an expert optician and personal stylist specializing in sunglasses.

Face shape: {face_shape}
Geometric ratios: {json.dumps(ratios, indent=2)}
User preferences: {json.dumps(preferences, indent=2)}

Available sunglasses (filtered for this face shape and budget):
{json.dumps(candidates, indent=2)}

Please recommend the top 3-5 sunglasses from the list above. For each recommendation:
1. Name the brand and model
2. Explain specifically why this frame style flatters a {face_shape} face shape
3. Mention the price and any style notes

Focus on how the frame geometry complements the face's proportions."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def get_fallback_recommendation(
    face_shape: str,
    ratios: dict,
    preferences: dict,
) -> str:
    budget_min = preferences.get("budget_min", 0)
    budget_max = preferences.get("budget_max", 10000)
    style      = preferences.get("style") or "any"
    material   = preferences.get("material") or "any"

    client = Anthropic()
    prompt = f"""You are an expert optician and personal stylist specializing in sunglasses.

The user has a **{face_shape}** face shape with these geometric measurements:
{json.dumps(ratios, indent=2)}

Their preferences:
- Budget: ${budget_min}–${budget_max}
- Style: {style}
- Frame material: {material}

Our product catalog has no matches for these exact criteria. Please suggest **3 real sunglasses** \
that are genuinely available for purchase online and that suit this person well.

For each suggestion include:
1. Brand and exact model name
2. Approximate retail price (USD)
3. Where to buy (retailer name or URL — e.g. Sunglass Hut, Amazon, the brand's own site)
4. A brief explanation of why this frame flatters a {face_shape} face shape

Be specific — name real products that exist, not generic descriptions. \
Make clear these are AI-sourced suggestions, not from a curated catalog."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
