import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

const video        = document.getElementById("video");
const canvas       = document.getElementById("overlay");
const ctx          = canvas.getContext("2d");
const shapeEl      = document.getElementById("shape-label");
const recommendBtn = document.getElementById("recommend-btn");

// Rolling buffer for temporal smoothing
const BUFFER_SIZE = 20;
const shapeBuffer = [];

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

  const ratios = computeRatios(lm);
  const shape  = classify(ratios);

  shapeBuffer.push(shape);
  if (shapeBuffer.length > BUFFER_SIZE) shapeBuffer.shift();

  const stable = mode(shapeBuffer);
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

// ─── Classification ───────────────────────────────────────────────────────────
//
// Thresholds derived from standard anthropometric face shape definitions.
// Order matters: most distinctive shapes checked first to avoid mis-classification.

function classify({ faceRatio, foreheadToCheek, cheekToJaw, foreheadToJaw }) {
  // Oblong: face is notably longer than it is wide
  if (faceRatio > 1.75) return "oblong";

  // Heart: wide forehead tapers to a narrow jaw
  if (foreheadToJaw > 1.35 && foreheadToCheek >= 0.98) return "heart";

  // Square: widths are all similar AND the face is not too long
  if (faceRatio < 1.5 && cheekToJaw < 1.2 && foreheadToCheek > 0.9 && foreheadToCheek < 1.1) return "square";

  // Round: not long, cheeks not dramatically wider than jaw (soft profile)
  if (faceRatio < 1.5 && cheekToJaw < 1.25) return "round";

  // Oval: balanced proportions — the catch-all default
  return "oval";
}

// ─── Temporal smoothing ───────────────────────────────────────────────────────

// Returns the most frequent element in arr (statistical mode)
function mode(arr) {
  const counts = {};
  for (const s of arr) counts[s] = (counts[s] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg) {
  shapeEl.textContent = msg;
}

// ─── Start ────────────────────────────────────────────────────────────────────

init();
