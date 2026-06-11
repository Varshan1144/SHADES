import { currentShape, currentRatios, currentConfidence, captureFrame, updateConfidenceDisplay } from "./camera.js";

const budgetMinInput = document.getElementById("budget-min");
const budgetMaxInput = document.getElementById("budget-max");
const styleSelect    = document.getElementById("style-select");
const materialSelect = document.getElementById("material-select");
const recommendBtn   = document.getElementById("recommend-btn");
const cameraWrap     = document.getElementById("camera-wrap");
const spinner        = document.getElementById("spinner");
const errorMsg       = document.getElementById("error-msg");
const stylistNote    = document.getElementById("stylist-note");
const stylistText    = document.getElementById("stylist-text");
const cardsGrid      = document.getElementById("cards-grid");

const API_URL = "http://localhost:8001/recommend";

// ─── Confidence lock ────────────────────────────────────────────────────────
// After a PyTorch result arrives the camera loop (60fps) would immediately
// overwrite the bars with MediaPipe values.  We hold a locked copy and
// re-apply it every animation frame — our RAF is queued after camera.js's,
// so we always get the last write in each frame.

let _lockedConf  = null;
let _lockedShape = null;
let _lockRafId   = null;

const _dominantEl = document.getElementById("shape-dominant");

function lockConfidenceDisplay(confidence, shape) {
  _lockedConf  = confidence;
  _lockedShape = shape;
  window.__confidenceLocked = true;
  if (_lockRafId) cancelAnimationFrame(_lockRafId);
  function tick() {
    if (!_lockedConf) return;
    updateConfidenceDisplay(_lockedConf, _lockedShape);
    _dominantEl.textContent = _lockedShape.charAt(0).toUpperCase() + _lockedShape.slice(1);
    _lockRafId = requestAnimationFrame(tick);
  }
  _lockRafId = requestAnimationFrame(tick);
}

function unlockConfidenceDisplay() {
  window.__confidenceLocked = false;
  _lockedConf  = null;
  _lockedShape = null;
  if (_lockRafId) { cancelAnimationFrame(_lockRafId); _lockRafId = null; }
}

// ─── Camera pulse ──────────────────────────────────────────────────────────
// Purely presentational: adds .face-detected when button is enabled (face locked).
new MutationObserver(() => {
  cameraWrap.classList.toggle("face-detected", !recommendBtn.disabled);
}).observe(recommendBtn, { attributes: true, attributeFilter: ["disabled"] });

// ─── Recommend ─────────────────────────────────────────────────────────────

// TESTING ONLY — majority voting across 7 captures (300ms apart).
// To restore: delete from here to END TESTING ONLY and uncomment the block below.
const _CAPTURES     = 7;
const _DELAY_MS     = 300;
const _MIN_CONF     = 40;
const _spinnerLabel = spinner.querySelector("span");

recommendBtn.addEventListener("click", async () => {
  if (!currentShape) return;

  setLoading(true);
  clearResults();

  const votes    = {};
  const confSums = {};

  try {
    for (let i = 0; i < _CAPTURES; i++) {
      _spinnerLabel.textContent = `Analyzing… (${i + 1}/${_CAPTURES})`;

      const body = {
        face_shape:   currentShape,
        image_base64: captureFrame(),
        ratios:       currentRatios,
        confidence:   currentConfidence,
        budget_min:   Number(budgetMinInput.value) || 0,
        budget_max:   Number(budgetMaxInput.value) || 10000,
        style:        styleSelect.value    || null,
        material:     materialSelect.value || null,
      };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || `Server error ${res.status}`);
      }

      const data = await res.json();

      votes[data.face_shape] = (votes[data.face_shape] || 0) + 1;
      if (data.confidence) {
        for (const [shape, pct] of Object.entries(data.confidence)) {
          confSums[shape] = (confSums[shape] || 0) + pct;
        }
      }

      if (i < _CAPTURES - 1) await new Promise(r => setTimeout(r, _DELAY_MS));
    }

    // Majority vote winner
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];

    // Average confidence values, re-normalise to exactly 100
    const shapes  = Object.keys(confSums);
    const rawAvg  = Object.fromEntries(shapes.map(s => [s, confSums[s] / _CAPTURES]));
    const floored = Object.fromEntries(shapes.map(s => [s, Math.floor(rawAvg[s])]));
    let   rem     = 100 - shapes.reduce((sum, s) => sum + floored[s], 0);
    const byFrac  = shapes.slice().sort((a, b) => (rawAvg[b] % 1) - (rawAvg[a] % 1));
    for (let i = 0; i < rem; i++) floored[byFrac[i]] += 1;

    // Minimum confidence threshold
    if ((floored[winner] ?? 0) < _MIN_CONF) {
      showError("Unable to classify clearly — please center your face and try again");
      return;
    }

    renderResults({
      face_shape: winner,
      confidence: floored,
      classifier: "pytorch",
      candidates: [],
      explanation: null,
      source:     "database",
    });

  } catch (err) {
    showError(err.message);
  } finally {
    _spinnerLabel.textContent = "Consulting your AI stylist…";
    setLoading(false);
  }
});
// END TESTING ONLY

// recommendBtn.addEventListener("click", async () => {
//   const shape = currentShape;
//   if (!shape) return;
//
//   const body = {
//     face_shape:   shape,
//     image_base64: captureFrame(),
//     ratios:       currentRatios,
//     confidence:   currentConfidence,
//     budget_min:   Number(budgetMinInput.value) || 0,
//     budget_max:   Number(budgetMaxInput.value) || 10000,
//     style:        styleSelect.value    || null,
//     material:     materialSelect.value || null,
//   };
//
//   setLoading(true);
//   clearResults();
//
//   try {
//     const res = await fetch(API_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(body),
//     });
//
//     if (!res.ok) {
//       const payload = await res.json().catch(() => ({}));
//       throw new Error(payload.detail || `Server error ${res.status}`);
//     }
//
//     renderResults(await res.json());
//   } catch (err) {
//     showError(err.message);
//   } finally {
//     setLoading(false);
//   }
// });

// ─── State helpers ──────────────────────────────────────────────────────────

function setLoading(on) {
  spinner.classList.toggle("visible", on);
  recommendBtn.disabled = on;
}

function clearResults() {
  unlockConfidenceDisplay();
  errorMsg.classList.remove("visible");
  errorMsg.textContent = "";
  stylistNote.classList.remove("visible");
  stylistText.innerHTML = "";
  cardsGrid.innerHTML = "";
  document.getElementById("ai-classified-badge").hidden = true;
}

function showError(msg) {
  errorMsg.textContent = `Error: ${msg}`;
  errorMsg.classList.add("visible");
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderResults({ candidates, explanation, source, confidence, classifier, face_shape }) {
  if (confidence && face_shape) {
    lockConfidenceDisplay(confidence, face_shape);
    document.getElementById("shape-dominant").textContent =
      face_shape.charAt(0).toUpperCase() + face_shape.slice(1);
  }
  if (classifier === "pytorch") {
    document.getElementById("ai-classified-badge").hidden = false;
  }

  // TESTING ONLY — skip cards, stylist note, and ai_search banner; show status message instead.
  // To restore full rendering: delete from here to END TESTING ONLY and uncomment the block below.
  const testMsg = document.createElement("div");
  testMsg.className = "ai-search-banner";
  testMsg.textContent = "PyTorch classification complete";
  cardsGrid.appendChild(testMsg);
  return;
  // END TESTING ONLY

  // if (source === "ai_search") {
  //   const banner = document.createElement("div");
  //   banner.className = "ai-search-banner";
  //   banner.textContent = "No exact matches in our catalog — here are AI-sourced suggestions";
  //   cardsGrid.appendChild(banner);
  // }
  //
  // if (explanation) {
  //   stylistText.innerHTML = parseMarkdown(explanation);
  //   stylistNote.classList.add("visible");
  // }
  //
  // if (!candidates?.length) return;
  //
  // for (const item of candidates) cardsGrid.appendChild(buildCard(item));
}

function buildCard(item) {
  const card = document.createElement("div");
  card.className = "sunglass-card";

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML = `
    <div class="card-brand">${esc(item.brand)}</div>
    <div class="card-model">${esc(item.model)}</div>
    <div class="card-badges">
      <span class="badge badge-style">${esc(item.style)}</span>
      <span class="badge badge-material">${esc(item.material)}</span>
    </div>`;

  const right = document.createElement("div");
  right.className = "card-right";

  const price = document.createElement("div");
  price.className = "card-price";
  price.textContent = `$${item.price}`;
  right.appendChild(price);

  if (item.link && isSafeUrl(item.link)) {
    const link = document.createElement("a");
    link.className = "card-link";
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View →";
    right.appendChild(link);
  }

  card.appendChild(info);
  card.appendChild(right);
  return card;
}

// ─── Markdown parser ────────────────────────────────────────────────────────

function parseMarkdown(text) {
  return text
    // 1. HTML-escape raw content first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 2. Block elements (### must come before ##)
    .replace(/^---$/gm, "<hr>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")  // > was escaped above
    // 3. Inline elements
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, rawUrl) => {
      const url = rawUrl.replace(/&amp;/g, "&");
      const safe = /^https?:\/\//.test(url) ? url : "#";
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    })
    // 4. Line breaks
    .replace(/\n/g, "<br>");
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch { return false; }
}
