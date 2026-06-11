"""One-time migration: load data/sunglasses.json into the PostgreSQL sunglasses table."""

import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DATA_PATH = Path(__file__).parent.parent / "data" / "sunglasses.json"
DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    sys.exit("DATABASE_URL is not set — add it to .env")

with open(DATA_PATH) as f:
    data = json.load(f)

conn = psycopg2.connect(DATABASE_URL)
try:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM sunglasses")
        before = cur.fetchone()[0]

        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO sunglasses
                (id, brand, model, style, price, face_shapes, material, link, image_url)
            VALUES %s
            ON CONFLICT (id) DO NOTHING
            """,
            [
                (
                    row["id"],
                    row["brand"],
                    row["model"],
                    row["style"],
                    row["price"],
                    row["face_shapes"],
                    row["material"],
                    row.get("link", ""),
                    row.get("image_url", ""),
                )
                for row in data
            ],
        )

        cur.execute("SELECT COUNT(*) FROM sunglasses")
        after = cur.fetchone()[0]

    conn.commit()
finally:
    conn.close()

inserted = after - before
skipped  = len(data) - inserted
print(f"Done. Inserted {inserted} rows, skipped {skipped} duplicates. Table now has {after} rows.")
