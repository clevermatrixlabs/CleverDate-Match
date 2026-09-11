---
name: DeepFace runtime
description: Headless DeepFace setup and ArcFace classification behavior in this Replit workspace.
---

DeepFace 0.0.100 with TensorFlow 2.21 requires `tf-keras`; the GUI OpenCV build fails in the headless environment. Use `opencv-python-headless==4.10.0.84`, which includes the Haar cascade assets.

**Why:** The initial OpenCV 5 headless package omitted the cascade data, and DeepFace refused to initialize. The TensorFlow/keras split also requires the compatibility package.

**How to apply:** Keep these Python dependencies pinned/declared together when reinstalling or moving the verification worker. DeepFace’s `verified` result is authoritative for confirmation; the displayed score is `1 - distance`.