# SHADES 🕶️
### AI-Powered Sunglasses Recommender

SHADES detects your face shape in real time via your webcam, computes geometric facial ratios, and uses Claude AI to recommend sunglasses that actually suit your face — filtered by budget, style, and frame material.

> **Demo:** *(coming soon — link will be added after deployment)*

---

## How it works

1. **Live camera analysis** — MediaPipe FaceLandmarker runs entirely in your browser, extracting 468 facial landmark points in real time. Nothing is uploaded during this step.
2. **Geometric ratio computation** — your code computes forehead width, cheekbone width, jaw width, and face length ratio from the landmarks to derive your face shape.
3. **Smart filtering** — the sunglasses database is filtered in code by your face shape, budget, style preference, and frame material.
4. **Claude recommendation** — Claude receives your face shape, raw measurements, preferences, and a shortlist of candidates, then ranks them and writes a personalized explanation for each pick.

```
Browser (JS)                          Server (Python)
─────────────────────────────         ──────────────────────────
Camera → MediaPipe (468pts)
       → Compute ratios
       → Derive shape label
       → [on capture] ──────────────→ Filter DB (shape/budget/style)
                                     → Claude API (rank + explain)
                                     → ←─── Result cards
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Face detection | MediaPipe FaceLandmarker (JS/WASM — runs in browser) |
| Ratio computation | Vanilla JavaScript |
| Frontend | HTML, CSS, JavaScript |
| Backend | Python + FastAPI |
| AI | Anthropic Claude API |
| Database | JSON flat file |
| Deployment | Frontend: static hosting · Backend: any Python host |

---

## Project structure

```
shades/
├── frontend/
│   ├── index.html          # Main UI
│   ├── camera.js           # MediaPipe, ratio computation, shape classification
│   ├── ui.js               # Result card rendering, UI interactions
│   └── style.css
├── backend/
│   ├── main.py             # FastAPI app, CORS, /recommend endpoint
│   └── recommender.py      # DB filtering + Claude API call
├── data/
│   └── sunglasses.json     # Sunglasses catalog
├── assets/
│   └── sample_images/      # Test photos included for instant testing
├── .env.example
├── requirements.txt
├── CLAUDE.md
├── CONTRIBUTING.md
└── README.md
```

---

## Getting started

### Prerequisites

- Python 3.10+
- A modern browser (Chrome or Firefox recommended)
- An Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com)

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/shades.git
cd shades
```

### 2. Set up the backend

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Add your API key

```bash
cp .env.example .env
# Open .env and add your Anthropic API key
```

### 4. Start the backend

```bash
cd backend
uvicorn main:app --reload
```

### 5. Open the frontend

Open `frontend/index.html` in your browser. Allow camera access when prompted.

That's it. Allow camera, center your face, hit **Analyze** — results appear in seconds.

---

## Sunglasses database

The catalog lives in `data/sunglasses.json`. Each entry looks like this:

```json
{
  "id": "ray-ban-aviator-classic",
  "brand": "Ray-Ban",
  "model": "Aviator Classic",
  "style": "classic",
  "price": 163,
  "face_shapes": ["oval", "heart", "oblong"],
  "material": "metal",
  "link": "https://www.ray-ban.com/usa/sunglasses/RB3025",
  "image_url": ""
}
```

**Price tiers:** under $50 · $50–150 · $150–300 · $300+  
**Styles:** classic · sporty · trendy · minimalist  
**Materials:** plastic · metal · rimless

---

## Contributing

The sunglasses database grows through community contributions. To add a pair:

1. Fork the repo
2. Add your entry to `data/sunglasses.json` following the schema above
3. Verify the purchase link is live
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines, including how to add new face shape mappings, report bugs, or suggest features.

---

## Face shape reference

| Shape | Key characteristics | Best frame styles |
|---|---|---|
| Oval | Balanced proportions, slightly narrower jaw than forehead | Most styles — aviators, wayfarers, square |
| Round | Similar width and length, soft angles | Angular and rectangular frames |
| Square | Strong jaw, broad forehead, similar width throughout | Round or oval frames |
| Heart | Wide forehead, narrow jaw | Bottom-heavy frames, rimless, aviators |
| Oblong | Face length greater than width | Tall frames, oversized, decorative temples |

---

## Privacy

- Face analysis runs entirely in your browser — no video or images are sent to any server
- Only the computed geometric ratios and your filter preferences are sent to the backend
- No photos are stored anywhere

---

## Environment variables

```bash
# .env.example
ANTHROPIC_API_KEY=your_key_here
```

Never commit your `.env` file. It is listed in `.gitignore` by default.

---

## Roadmap

**MVP (current)**
- [x] Real-time face shape detection
- [x] Budget, style, and material filtering
- [x] Claude-generated recommendation explanations
- [x] Photo upload and snapshot as alternatives to live camera

**V2**
- [ ] Follow-up chat — ask Claude follow-up questions about recommendations
- [ ] Skin tone detection + frame color suggestions
- [ ] Download summary card as PNG
- [ ] Shareable results link
- [ ] Dark mode
- [ ] Expand database to 100+ entries

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built with [MediaPipe](https://developers.google.com/mediapipe) · [Claude API](https://www.anthropic.com) · [FastAPI](https://fastapi.tiangolo.com)*
