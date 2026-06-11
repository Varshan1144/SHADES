# SHADES — Branch Strategy

## Overview
Three branches for three different approaches to face shape classification.
Main branch contains the working MVP. Other branches are experimental.

---

## Branch: main
**Status:** Working MVP — DO NOT BREAK

**What's in it:**
- Full working pipeline end to end
- MediaPipe face detection in browser (VIDEO mode)
- Geometric ratio classifier (known bug — mostly detects oval)
- FastAPI backend
- Supabase PostgreSQL (66 entries)
- Claude API recommendations
- UI with dark theme, confidence bars, scan animation
- Price range filter
- No-results fallback to Claude

**Known issue:**
Face shape classifier only reliably detects "oval" and "heart".
This is a fundamental limitation of the geometric ratio approach.
Do not attempt to fix this on main — use the branches below.

---

## Branch: pretrained-model
**Status:** In progress

**Goal:**
Integrate a pre-trained face shape classification model from HuggingFace
instead of the broken geometric ratio classifier.

**Model chosen:**
fahd9999/face_shape_classification
- Architecture: EfficientNetB4 + CNN
- Accuracy: 85% on validation set
- Classes: Oval, Round, Square, Heart, Diamond
- Note: Uses "Diamond" instead of "Oblong" — map Diamond → Oblong in code

**Approach:**
- User hits "Get Recommendations"
- Frontend captures a frame as base64 JPEG
- Sends it to backend with the POST request
- Backend runs the HuggingFace model on the image
- Returns shape + confidence scores
- Uses classified shape for DB filtering and Claude prompt
- Frontend updates confidence bars with model output

**Dependencies to add:**
- transformers
- torch
- torchvision
- Pillow (already installed)

**Files to change:**
- backend/recommender.py — add classify_face_shape(image_base64) function
- backend/main.py — update RecommendRequest to accept image_base64
- frontend/camera.js — add captureFrame() export
- frontend/ui.js — send base64 frame in POST request

**Mapping:**
Diamond → Oblong (similar face geometry, acceptable approximation)

---

## Branch: train-own-model
**Status:** Not started

**Goal:**
Collect a labeled face shape dataset and train our own classifier
on MediaPipe landmark features. This removes the image dependency
and keeps everything lightweight.

**Approach:**
1. Find dataset on Kaggle/HuggingFace with labeled face shape images
2. Run MediaPipe on each image, extract 468 landmark coordinates
3. Compute the 4 ratios as features (or use raw landmarks)
4. Train scikit-learn SVM or Random Forest
5. Save model as models/shape_model.pkl
6. Load and run model in camera.js (via ONNX export) or backend

**Dataset options to try:**
- Kaggle: "Face Shape Dataset" (search for it)
- HuggingFace: bkprocovid19/face_shape (used to train fahd9999 model)
- Manual collection: 50-100 photos per shape, labeled

**Target accuracy:** 80%+ across all 5 shapes

**Advantage over pretrained-model branch:**
- No large model download (torch/transformers is ~500MB)
- Runs faster — sklearn inference is microseconds
- Can run client-side in browser via ONNX
- Fully custom — you own the model

**Disadvantage:**
- Requires labeled training data
- More work to set up training pipeline
- May not reach 85% accuracy without enough data

---

## Merging strategy

Once a branch produces better face shape detection than main:
1. Test thoroughly with multiple people and face shapes
2. Compare accuracy against main's geometric approach
3. If clearly better, merge into main
4. Delete the losing branch

Only one classifier approach will exist in main at any time.

---

## How to switch branches

```bash
# Switch to main (working MVP)
git checkout main

# Switch to pretrained model work
git checkout pretrained-model

# Switch to train own model work
git checkout train-own-model
```

Always check which branch you're on before making changes:
```bash
git branch
```
