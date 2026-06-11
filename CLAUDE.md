# SHADES — Claude Code Project Guide

## What this project is
An open-source, AI-powered sunglasses recommender. A camera detects the user's 
face in real time, computes geometric ratios, classifies face shape, filters a 
sunglasses database, then calls Claude once to rank and explain the best matches.

Live at: (deployment URL — add after deploy)
GitHub: (add after push)

---

## Current Architecture (as of June 2026)

### Stack
| Layer | Technology |
|---|---|
| Face detection | MediaPipe FaceLandmarker (JS/WASM — runs in browser, VIDEO mode) |
| Ratio computation | Vanilla JavaScript |
| Frontend | HTML, CSS, JavaScript |
| Backend | Python + FastAPI (port 8001) |
| Database | Supabase PostgreSQL (66 sunglasses entries) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| Frontend server | python3 -m http.server 8000 |

### Folder structure
```
shades/
├── frontend/
│   ├── index.html       # Main UI — dark theme, two column layout
│   ├── camera.js        # MediaPipe, ratio computation, shape scoring, confidence bars
│   ├── ui.js            # Result cards, POST to backend, markdown parsing
│   └── style.css        # Dark theme (#0f0f0f bg, #00ffa0 green accent)
├── backend/
│   ├── main.py          # FastAPI app, CORS, /recommend endpoint
│   └── recommender.py   # DB filtering + Claude API call + fallback
├── data/
│   └── sunglasses.json  # Source data (migrated to Supabase, kept as backup)
├── assets/
│   └── sample_images/
├── V2_VIRTUAL_TRYON.md  # V2 feature spec — documented, not built yet
├── V2_FRAME_CHECK.md    # V2 feature spec — documented, not built yet
├── BRANCHES.md          # Branch strategy and status
├── CLAUDE.md            # This file
├── README.md
├── requirements.txt
├── .env                 # Never commit — contains API keys
└── .env.example
```

---

## Pipeline — Critical Rules

### Real-time loop (runs continuously, NO Claude, NO backend)
```
camera frame → MediaPipe (468 landmarks, VIDEO mode)
             → compute 4 ratios
             → score all 5 shapes
             → update confidence bars live
```

### On capture (runs once, on button click)
```
face shape + ratios + confidence + user prefs
→ POST to localhost:8001/recommend
→ filter Supabase DB (shape, budget_min, budget_max, style, material)
→ if no results: Claude fallback (AI-sourced suggestions)
→ Claude API (rank + explain shortlist)
→ result cards rendered in right panel
```

**Claude is NEVER called inside the real-time frame loop.**
**Claude is called exactly once per user capture.**

---

## What Claude receives at recommendation time
```json
{
  "face_shape": "oval",
  "ratios": {
    "faceRatio": 1.42,
    "foreheadToCheek": 0.87,
    "cheekToJaw": 1.31,
    "foreheadToJaw": 0.94
  },
  "confidence": {
    "oval": 62,
    "round": 18,
    "square": 12,
    "heart": 5,
    "oblong": 3
  },
  "budget_min": 50,
  "budget_max": 200,
  "style": "classic",
  "material": "metal"
}
```

---

## Known Issues & Decisions Made

### Face shape classifier — KNOWN BUG
The geometric ratio classifier in camera.js only reliably detects 
"oval" and occasionally "heart". Other shapes are rarely detected.

Root cause: MediaPipe landmarks are optimized for expression tracking, 
not anthropometric measurement. Forehead has sparse coverage. 
Ratios are sensitive to camera distance and head angle.

### Branch strategy for fixing this
- main — current geometric classifier (ships as-is for MVP)
- pretrained-model — integrate fahd9999/face_shape_classification 
  from HuggingFace (EfficientNetB4, 85% accuracy)
- train-own-model — collect dataset, train SVM on landmark features

Currently working on: pretrained-model branch

### Landmark indices used (verified from MediaPipe docs)
| Measurement | Left | Right | Notes |
|---|---|---|---|
| Face top | 10 | — | Forehead center |
| Face bottom | 152 | — | Chin |
| Cheekbone width | 234 | 454 | Standard face width landmarks |
| Jaw width | 172 | 397 | Lower jaw angle |
| Forehead width | 70 | 300 | Outer eyebrow — best available proxy |

Note: MediaPipe has sparse forehead coverage. Outer eyebrow points 
(70, 300) are the widest reliable forehead proxy.

---

## Database

### Supabase connection
- Connection string in .env as DATABASE_URL
- Transaction pooler URL (not direct connection)
- Table: sunglasses (66 entries)
- Schema: id, brand, model, style, price, face_shapes[], material, link, image_url

### Price tiers
- Under $50: Tifosi, A.J. Morgan, Knockaround, Goodr, Sungait
- $50-150: Warby Parker, Oakley Frogskins, Quay, Nike, Spy Optic
- $150-300: Oakley Holbrook, Maui Jim, Costa Del Mar, Randolph, Smith
- $300+: Persol, Oliver Peoples, Moscot, Celine, Tom Ford, Gucci

### No-results fallback
If filter_database() returns empty, get_fallback_recommendation() 
calls Claude to suggest real products from general knowledge.
Response includes source: ai_search flag.
Frontend shows amber banner for AI-sourced results.

---

## Environment Variables
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://postgres.xxx:[password]@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

Never commit .env. It is in .gitignore.

---

## Running the app locally
```bash
# Terminal 1 — frontend
cd ~/shades
python3 -m http.server 8000

# Terminal 2 — backend
cd ~/shades/backend
source ../venv/bin/activate
uvicorn main:app --reload --port 8001
```

Open: http://localhost:8000/frontend/index.html

---

## What NOT to do
- Never call Claude inside the real-time camera loop
- Never pass raw 468 landmark coordinates to Claude
- Never commit .env or any file containing API keys
- Never add user accounts, login, or server-side photo storage
- Never add e-commerce checkout — purchase links only
- Never use sudo with pip — use the venv

---

## V2 Features (documented, not built)
- Virtual try-on overlay (V2_VIRTUAL_TRYON.md)
- Frame Check — does this suit me? text search (V2_FRAME_CHECK.md)
- Follow-up chat with Claude
- Skin tone + frame color suggestions
- Download summary card as PNG
- Shareable results link
- Expand DB to 100+ entries

---

## Build phases completed
- Phase 1: Repo scaffold — DONE
- Phase 2: MediaPipe face detection + landmark overlay — DONE
- Phase 3: FastAPI backend + Supabase PostgreSQL + Claude API — DONE
- Phase 4: Frontend wired to backend, full pipeline — DONE
- Phase 5: UI polish (dark theme, confidence bars, scan animation) — DONE
- Phase 6: Price range filter, no-results fallback — DONE
- Phase 7: Face shape classifier improvement — IN PROGRESS (pretrained-model branch)
- Phase 8: Deployment — PENDING
