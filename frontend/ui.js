import { currentShape, currentRatios, currentConfidence } from "./camera.js";

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

// ─── Camera pulse ──────────────────────────────────────────────────────────
// Purely presentational: adds .face-detected when button is enabled (face locked).
new MutationObserver(() => {
  cameraWrap.classList.toggle("face-detected", !recommendBtn.disabled);
}).observe(recommendBtn, { attributes: true, attributeFilter: ["disabled"] });

// ─── Recommend ─────────────────────────────────────────────────────────────

recommendBtn.addEventListener("click", async () => {
  const shape = currentShape;
  if (!shape) return;

  const body = {
    face_shape:  shape,
    ratios:      currentRatios,
    confidence:  currentConfidence,
    budget_min:  Number(budgetMinInput.value) || 0,
    budget_max:  Number(budgetMaxInput.value) || 10000,
    style:       styleSelect.value    || null,
    material:    materialSelect.value || null,
  };

  setLoading(true);
  clearResults();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.detail || `Server error ${res.status}`);
    }

    renderResults(await res.json());
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

// ─── State helpers ──────────────────────────────────────────────────────────

function setLoading(on) {
  spinner.classList.toggle("visible", on);
  recommendBtn.disabled = on;
}

function clearResults() {
  errorMsg.classList.remove("visible");
  errorMsg.textContent = "";
  stylistNote.classList.remove("visible");
  stylistText.innerHTML = "";
  cardsGrid.innerHTML = "";
}

function showError(msg) {
  errorMsg.textContent = `Error: ${msg}`;
  errorMsg.classList.add("visible");
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderResults({ candidates, explanation, source }) {
  if (source === "ai_search") {
    const banner = document.createElement("div");
    banner.className = "ai-search-banner";
    banner.textContent = "No exact matches in our catalog — here are AI-sourced suggestions";
    cardsGrid.appendChild(banner);
  }

  if (explanation) {
    stylistText.innerHTML = parseMarkdown(explanation);
    stylistNote.classList.add("visible");
  }

  if (!candidates?.length) return;

  for (const item of candidates) cardsGrid.appendChild(buildCard(item));
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
