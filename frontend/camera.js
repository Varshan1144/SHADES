import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

const video        = document.getElementById("video");
const canvas       = document.getElementById("overlay");
const ctx          = canvas.getContext("2d");
const dominantEl   = document.getElementById("shape-dominant");
const recommendBtn = document.getElementById("recommend-btn");

const confEls = {
  oval:   { bar: document.getElementById("conf-bar-oval"),   pct: document.getElementById("conf-pct-oval"),   row: document.getElementById("conf-row-oval")   },
  round:  { bar: document.getElementById("conf-bar-round"),  pct: document.getElementById("conf-pct-round"),  row: document.getElementById("conf-row-round")  },
  square: { bar: document.getElementById("conf-bar-square"), pct: document.getElementById("conf-pct-square"), row: document.getElementById("conf-row-square") },
  heart:  { bar: document.getElementById("conf-bar-heart"),  pct: document.getElementById("conf-pct-heart"),  row: document.getElementById("conf-row-heart")  },
  oblong: { bar: document.getElementById("conf-bar-oblong"), pct: document.getElementById("conf-pct-oblong"), row: document.getElementById("conf-row-oblong") },
};

// Rolling buffer for temporal smoothing on per-frame scores
const BUFFER_SIZE = 20;
const scoreBuffer = [];
let frameCount = 0;

// Exported so ui.js can read the stabilized shape, ratios, and confidence on button fire
export let currentShape      = null;
export let currentRatios     = {};
export let currentConfidence = {};

const SHAPE_ORDER = ["oval", "round", "square", "heart", "oblong"];

// ─── Landmark indices ────────────────────────────────────────────────────────
// Verified MediaPipe indices for accurate anthropometric measurement:
//   10/152    → face height (forehead center → chin)
//   234/454   → cheekbone width (zygomatic arch, widest face point)
//   70/300    → forehead width proxy (outer eyebrow — best sparse-coverage point)
//   172/397   → jaw width (lower jaw angle)
const LM = {
  top:           10,
  chin:         152,
  cheekLeft:    234,
  cheekRight:   454,
  foreheadLeft:  70,
  foreheadRight: 300,
  jawLeft:       172,
  jawRight:      397,
};

// ─── Init ────────────────────────────────────────────────────────────────────

let faceLandmarker = null;

async function init() {
  setStatus("Loading model…");

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  // VIDEO mode is the correct web-JS pattern for live webcam detection —
  // detectForVideo returns results synchronously as a plain return value.
  // LIVE_STREAM + resultListener is the native mobile SDK pattern and the
  // resultListener callback is silently ignored in the browser WASM build.
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    outputFaceBlendshapes: false,
    runningMode: "VIDEO",
    numFaces: 1,
  });
  console.log("[SHADES] FaceLandmarker ready, runningMode: VIDEO");

  setStatus("Requesting camera…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
    });
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => {
      // videoWidth/Height can be 0 on some browsers during loadeddata; fall back to constraints
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      console.log("[SHADES] Video ready. Dimensions:", canvas.width, "×", canvas.height);
      setStatus("Center your face in the frame");
      requestAnimationFrame(detect);
    });
  } catch {
    setStatus("Camera access denied — allow camera and refresh");
  }
}

// ─── Detection loop ──────────────────────────────────────────────────────────

function detect(timestamp) {
  console.log("[SHADES] detect() called, ts:", Math.round(timestamp));

  // Guard: faceLandmarker should always be set here, but be explicit
  if (!faceLandmarker) {
    console.warn("[SHADES] detect() fired before faceLandmarker ready — skipping");
    requestAnimationFrame(detect);
    return;
  }

  let results;
  try {
    console.log("[SHADES] calling detectForVideo");
    // VIDEO mode returns results as a synchronous return value
    results = faceLandmarker.detectForVideo(video, timestamp);
  } catch (err) {
    console.error("[SHADES] detectForVideo threw:", err);
    requestAnimationFrame(detect);
    return;
  }

  onResults(results);
  requestAnimationFrame(detect);
}

// ─── Results callback ────────────────────────────────────────────────────────

function onResults(results) {
  console.log("[SHADES] onResults. Faces detected:", results.faceLandmarks?.length ?? 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.faceLandmarks?.length) {
    setStatus("No face detected");
    recommendBtn.disabled = true;
    for (const shape of SHAPE_ORDER) {
      confEls[shape].bar.style.width = "0%";
      confEls[shape].pct.textContent = "—";
      confEls[shape].row.classList.remove("is-dominant");
    }
    return;
  }

  const lm = results.faceLandmarks[0];
  console.log("[SHADES] Landmark count:", lm.length, "| Sample[10]:", lm[10]);

  drawDots(lm);

  frameCount++;
  const ratios = computeRatios(lm);
  const scores = scoreShapes(ratios);

  scoreBuffer.push(scores);
  if (scoreBuffer.length > BUFFER_SIZE) scoreBuffer.shift();

  if (frameCount % 30 === 0) {
    console.log("[SHADES] ratios:", {
      faceRatio:       +ratios.faceRatio.toFixed(3),
      foreheadToCheek: +ratios.foreheadToCheek.toFixed(3),
      cheekToJaw:      +ratios.cheekToJaw.toFixed(3),
      foreheadToJaw:   +ratios.foreheadToJaw.toFixed(3),
    });
    console.log("[SHADES] avg scores:", Object.fromEntries(
      Object.entries(averageScores(scoreBuffer)).map(([k, v]) => [k, +v.toFixed(4)])
    ));
  }

  const avg        = averageScores(scoreBuffer);
  const stable     = Object.entries(avg).sort((a, b) => b[1] - a[1])[0][0];
  const confidence = normalizeToPercent(avg);

  currentShape      = stable;
  currentRatios     = ratios;
  currentConfidence = confidence;

  if (frameCount % 10 === 0) {
    setStatus(stable.charAt(0).toUpperCase() + stable.slice(1));
    updateConfidenceDisplay(confidence, stable);
  }
  recommendBtn.disabled = false;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawDots(lm) {
  ctx.fillStyle = "rgba(0, 255, 160, 0.75)";
  for (const { x, y } of lm) {
    ctx.beginPath();
    ctx.arc(x * canvas.width, y * canvas.height, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ─── Geometry ────────────────────────────────────────────────────────────────

// Euclidean distance between two landmarks in pixel space
function px(a, b) {
  const dx = (a.x - b.x) * canvas.width;
  const dy = (a.y - b.y) * canvas.height;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeRatios(lm) {
  const faceHeight    = px(lm[LM.top],           lm[LM.chin]);
  const faceWidth     = px(lm[LM.cheekLeft],      lm[LM.cheekRight]);
  const foreheadWidth = px(lm[LM.foreheadLeft],   lm[LM.foreheadRight]);
  const jawWidth      = px(lm[LM.jawLeft],         lm[LM.jawRight]);

  return {
    faceRatio:       faceHeight    / faceWidth,    // oval 1.3–1.6
    foreheadToCheek: foreheadWidth / faceWidth,    // oval 0.75–0.95
    cheekToJaw:      faceWidth     / jawWidth,     // oval 1.1–1.4
    foreheadToJaw:   foreheadWidth / jawWidth,     // oval 0.85–1.1
  };
}

// ─── Classification (scoring) ─────────────────────────────────────────────────
//
// Each shape gets a continuous 0–1 score based on how well the ratios match its
// geometric profile. Scores are averaged over the last BUFFER_SIZE frames and
// the highest average wins — more robust than hard thresholds.

// Anthropometrically calibrated shape profiles: [min, max] for each ratio.
// rangeScore peaks at 1.0 in the center of [min,max] and decays with a
// gaussian envelope toward the edges, so scores compose multiplicatively
// without any single ratio dominating via hard cutoffs.
const PROFILES = {
  oval:   { faceRatio: [1.30, 1.75], foreheadToCheek: [0.75, 0.95], cheekToJaw: [1.10, 1.40], foreheadToJaw: [0.85, 1.10] },
  round:  { faceRatio: [0.85, 1.20], foreheadToCheek: [0.85, 1.00], cheekToJaw: [1.00, 1.20], foreheadToJaw: [0.90, 1.10] },
  square: { faceRatio: [0.95, 1.25], foreheadToCheek: [0.90, 1.05], cheekToJaw: [0.95, 1.15], foreheadToJaw: [0.95, 1.10] },
  heart:  { faceRatio: [1.20, 1.60], foreheadToCheek: [1.00, 1.30], cheekToJaw: [1.20, 1.70], foreheadToJaw: [1.30, 1.90] },
  oblong: { faceRatio: [1.75, 2.50], foreheadToCheek: [0.80, 1.00], cheekToJaw: [1.00, 1.30], foreheadToJaw: [0.85, 1.10] },
};

// Gaussian decay: 1.0 at center of [min,max], falls to ~0.14 at the edges
function rangeScore(value, min, max) {
  const center    = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  const t         = (value - center) / halfWidth;
  return Math.exp(-2 * t * t);
}

function scoreShapes({ faceRatio, foreheadToCheek, cheekToJaw, foreheadToJaw }) {
  const scores = {};
  for (const [shape, profile] of Object.entries(PROFILES)) {
    scores[shape] =
      rangeScore(faceRatio,       profile.faceRatio[0],       profile.faceRatio[1])       *
      rangeScore(foreheadToCheek, profile.foreheadToCheek[0], profile.foreheadToCheek[1]) *
      rangeScore(cheekToJaw,      profile.cheekToJaw[0],      profile.cheekToJaw[1])       *
      rangeScore(foreheadToJaw,   profile.foreheadToJaw[0],   profile.foreheadToJaw[1]);
  }
  return scores;
}

// ─── Temporal smoothing ───────────────────────────────────────────────────────

function averageScores(buffer) {
  const sums = { round: 0, oval: 0, square: 0, heart: 0, oblong: 0 };
  for (const s of buffer) for (const k of Object.keys(sums)) sums[k] += s[k];
  const n = buffer.length;
  for (const k of Object.keys(sums)) sums[k] /= n;
  return sums;
}

// Converts raw avg scores to integer percentages summing to exactly 100.
// Uses largest-remainder method to avoid off-by-one rounding errors.
function normalizeToPercent(avg) {
  const total = Object.values(avg).reduce((s, v) => s + v, 0);
  if (total === 0) return Object.fromEntries(SHAPE_ORDER.map(k => [k, 0]));
  const scaled  = Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, (v / total) * 100]));
  const floored = Object.fromEntries(Object.entries(scaled).map(([k, v]) => [k, Math.floor(v)]));
  const remainder = 100 - Object.values(floored).reduce((s, v) => s + v, 0);
  Object.entries(scaled)
    .map(([k, v]) => [k, v - Math.floor(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, remainder)
    .forEach(([k]) => floored[k]++);
  return floored;
}

function updateConfidenceDisplay(confidence, dominant) {
  for (const shape of SHAPE_ORDER) {
    const els = confEls[shape];
    const pct = confidence[shape] ?? 0;
    els.bar.style.width = `${pct}%`;
    els.pct.textContent = `${pct}%`;
    els.row.classList.toggle("is-dominant", shape === dominant);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg) {
  dominantEl.textContent = msg;
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
