import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

const video        = document.getElementById("video");
const canvas       = document.getElementById("overlay");
const ctx          = canvas.getContext("2d");
const shapeEl      = document.getElementById("shape-label");
const recommendBtn = document.getElementById("recommend-btn");

// Rolling buffer for temporal smoothing on per-frame scores
const BUFFER_SIZE = 20;
const scoreBuffer = [];
let frameCount = 0;

// Exported so ui.js can read the stabilized shape and ratios when the button fires
export let currentShape  = null;
export let currentRatios = {};

// ─── Landmark indices ────────────────────────────────────────────────────────
// Chosen to approximate standard anthropometric measurement planes:
//   faceTop/chin  → face length
//   forehead L/R  → lateral hairline (not brow — gives true forehead width)
//   cheek L/R     → zygomatic arch (widest point of face)
//   jaw L/R       → gonion (jaw angle), standard for jaw width
const LM = {
  faceTop:       10,
  chin:         152,
  foreheadLeft: 103,
  foreheadRight: 332,
  cheekLeft:    234,
  cheekRight:   454,
  jawLeft:      136,
  jawRight:     365,
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
    setStatus("No face detected — center your face");
    recommendBtn.disabled = true;
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

  if (frameCount % 60 === 0) {
    console.log("[SHADES] ratios:", {
      faceRatio:       +ratios.faceRatio.toFixed(3),
      foreheadToCheek: +ratios.foreheadToCheek.toFixed(3),
      cheekToJaw:      +ratios.cheekToJaw.toFixed(3),
      foreheadToJaw:   +ratios.foreheadToJaw.toFixed(3),
    });
    console.log("[SHADES] avg scores:", Object.fromEntries(
      Object.entries(averageScores(scoreBuffer)).map(([k, v]) => [k, +v.toFixed(3)])
    ));
  }

  const avg    = averageScores(scoreBuffer);
  const stable = Object.entries(avg).sort((a, b) => b[1] - a[1])[0][0];
  currentShape  = stable;
  currentRatios = ratios;

  setStatus(stable.charAt(0).toUpperCase() + stable.slice(1));
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
  const faceLength    = px(lm[LM.faceTop],        lm[LM.chin]);
  const foreheadWidth = px(lm[LM.foreheadLeft],   lm[LM.foreheadRight]);
  const cheekWidth    = px(lm[LM.cheekLeft],       lm[LM.cheekRight]);
  const jawWidth      = px(lm[LM.jawLeft],         lm[LM.jawRight]);

  return {
    faceRatio:       faceLength    / cheekWidth,   // > 1.75 → oblong; < 1.5 → round/square
    foreheadToCheek: foreheadWidth / cheekWidth,   // > 1.0 → forehead wider than cheeks
    cheekToJaw:      cheekWidth    / jawWidth,      // > 1.2 → cheeks clearly wider than jaw
    foreheadToJaw:   foreheadWidth / jawWidth,      // > 1.35 → heart shape indicator
  };
}

// ─── Classification (scoring) ─────────────────────────────────────────────────
//
// Each shape gets a continuous 0–1 score based on how well the ratios match its
// geometric profile. Scores are averaged over the last BUFFER_SIZE frames and
// the highest average wins — more robust than hard thresholds.

function scoreShapes({ faceRatio, foreheadToCheek, cheekToJaw }) {
  return {
    round:  mean(near(faceRatio, 1.0, 0.4),  near(cheekToJaw, 1.0, 0.35)),
    oval:   mean(near(faceRatio, 1.4, 0.35), near(foreheadToCheek, 0.875, 0.25)),
    square: mean(near(faceRatio, 1.1, 0.25), near(cheekToJaw, 1.0, 0.25), near(foreheadToCheek, 1.0, 0.2)),
    heart:  mean(above(foreheadToCheek, 1.0, 0.3), above(cheekToJaw, 1.2, 0.3)),
    oblong: above(faceRatio, 1.5, 0.5),
  };
}

// 1 at target, falls linearly to 0 at ±spread
function near(value, target, spread) {
  return Math.max(0, 1 - Math.abs(value - target) / spread);
}

// 0 at threshold, ramps linearly to 1 over spread
function above(value, threshold, spread) {
  return Math.max(0, Math.min(1, (value - threshold) / spread));
}

function mean(...vals) {
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// ─── Temporal smoothing ───────────────────────────────────────────────────────

function averageScores(buffer) {
  const sums = { round: 0, oval: 0, square: 0, heart: 0, oblong: 0 };
  for (const s of buffer) for (const k of Object.keys(sums)) sums[k] += s[k];
  const n = buffer.length;
  for (const k of Object.keys(sums)) sums[k] /= n;
  return sums;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg) {
  shapeEl.textContent = msg;
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
