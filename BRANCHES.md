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

## Branch: fine-tuned
**Status:** In progress

**Goal:**
Take the existing pretrained PyTorch model (model_85_nn_.pth) and
fine-tune it on additional labeled face shape data to improve
accuracy beyond the current 85%.

**Starting point:**
Inherits everything from pretrained-model branch.
Same model file: models/face_shape_hf/model_85_nn_.pth
Same integration in backend/recommender.py

**Approach:**
1. Download face shape dataset from Kaggle (niten19/face-shape-dataset)
   - 5 classes: Heart, Oblong, Oval, Round, Square
   - ~5000 labeled images
2. Load existing model_85_nn_.pth
3. Freeze early layers (keep EfficientNetB4 feature extraction)
4. Retrain only the final classification layers on new data
5. Use Mac Metal (mps) backend for GPU acceleration
6. Save improved model as models/face_shape_finetuned.pth
7. Update backend/recommender.py to load new model

**Target:** 90%+ accuracy across all 5 shapes

**Dependencies to add:**
- torch (already installed)
- torchvision (already installed)
- kaggle (for dataset download)

**Training plan:**
- Freeze: EfficientNetB4 backbone layers
- Unfreeze: Final 2-3 layers + classifier head
- Optimizer: Adam, lr=0.0001
- Epochs: 10-20
- Batch size: 32
- Augmentation: horizontal flip, rotation ±15°, color jitter

---

## Branch: train-own-model
**Status:** Not started

**Goal:**
Build a face shape classifier completely from scratch.
No pretrained weights, no existing model.
Full control over architecture, training data, and pipeline.

**Approach:**
1. Collect or download labeled face shape images
2. Design CNN architecture from scratch
3. Train on collected data
4. Export as ONNX for potential browser-side inference
5. Save as models/shape_model_custom.pth

**Advantage over other branches:**
- Complete ownership of the model
- Can optimize specifically for webcam captures
- Potentially exportable to run client-side in browser
- No dependency on external model files

**Disadvantage (vs pretrained-model / fine-tuned):**
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

# Switch to fine-tuned model work
git checkout fine-tuned

# Switch to train own model work
git checkout train-own-model
```

Always check which branch you're on before making changes:
```bash
git branch
```
