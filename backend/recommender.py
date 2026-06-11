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
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, brand, model, style, price, face_shapes, material, link, image_url
                FROM sunglasses
                WHERE %(shape)s = ANY(face_shapes)
                  AND price >= %(budget_min)s
                  AND price <= %(budget_max)s
                  AND (%(style)s IS NULL OR style = %(style)s)
                  AND (%(material)s IS NULL OR material = %(material)s)
                ORDER BY price
                LIMIT 10
                """,
                {
                    "shape": shape,
                    "budget_min": budget_min,
                    "budget_max": budget_max,
                    "style": style,
                    "material": material,
                },
            )
            rows = cur.fetchall()
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
