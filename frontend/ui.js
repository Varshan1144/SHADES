import { currentShape, currentRatios } from "./camera.js";

const budgetSlider  = document.getElementById("budget-slider");
const budgetDisplay = document.getElementById("budget-display");
const styleSelect   = document.getElementById("style-select");
const materialSelect= document.getElementById("material-select");
const recommendBtn  = document.getElementById("recommend-btn");
const spinner       = document.getElementById("spinner");
const errorMsg      = document.getElementById("error-msg");
const stylistNote   = document.getElementById("stylist-note");
const stylistText   = document.getElementById("stylist-text");
const cardsGrid     = document.getElementById("cards-grid");

const API_URL = "http://localhost:8001/recommend";

// Live budget label
budgetSlider.addEventListener("input", () => {
  const v = parseInt(budgetSlider.value, 10);
  budgetDisplay.textContent = v >= 500 ? "$500+" : `$${v}`;
});

recommendBtn.addEventListener("click", async () => {
  const shape = currentShape;
  if (!shape) return;

  const budgetMax = parseInt(budgetSlider.value, 10);

  const body = {
    face_shape: shape,
    ratios: currentRatios,
    budget_min: 0,
    budget_max: budgetMax >= 500 ? 10000 : budgetMax,
    style:    styleSelect.value    || null,
    material: materialSelect.value || null,
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

    const data = await res.json();
    renderResults(data);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

// ─── State helpers ────────────────────────────────────────────────────────────

function setLoading(on) {
  spinner.classList.toggle("visible", on);
  recommendBtn.disabled = on;
}

function clearResults() {
  errorMsg.classList.remove("visible");
  errorMsg.textContent = "";
  stylistNote.classList.remove("visible");
  stylistText.textContent = "";
  cardsGrid.innerHTML = "";
}

function showError(msg) {
  errorMsg.textContent = `Error: ${msg}`;
  errorMsg.classList.add("visible");
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderResults({ candidates, explanation }) {
  if (explanation) {
    stylistText.textContent = explanation;
    stylistNote.classList.add("visible");
  }

  if (!candidates?.length) {
    cardsGrid.innerHTML = '<p class="results-placeholder">No matches found — try broadening your filters.</p>';
    return;
  }

  for (const item of candidates) {
    cardsGrid.appendChild(buildCard(item));
  }
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

// ─── Utilities ────────────────────────────────────────────────────────────────

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
  } catch {
    return false;
  }
}
