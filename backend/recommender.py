import json
from pathlib import Path
from typing import Optional
from anthropic import Anthropic

DATA_PATH = Path(__file__).parent.parent / "data" / "sunglasses.json"


def filter_database(
    shape: str,
    budget_min: float,
    budget_max: float,
    style: Optional[str] = None,
    material: Optional[str] = None,
) -> list:
    with open(DATA_PATH) as f:
        db = json.load(f)
    results = [
        item
        for item in db
        if shape in item["face_shapes"]
        and budget_min <= item["price"] <= budget_max
        and (style is None or item["style"] == style)
        and (material is None or item["material"] == material)
    ]
    return results[:10]


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
