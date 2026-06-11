import json
import os
from typing import Optional

import psycopg2
import psycopg2.extras
from anthropic import Anthropic


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
