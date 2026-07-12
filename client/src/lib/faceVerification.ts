import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

let modelsReady = false;
let loadPromise: Promise<void> | null = null;

export function loadFaceModels(onProgress?: (label: string) => void): Promise<void> {
  if (modelsReady) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.('Loading face detector...');
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    onProgress?.('Loading face landmarks...');
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    onProgress?.('Loading face recognition...');
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    onProgress?.('Loading high-accuracy detector...');
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    modelsReady = true;
  })();

  return loadPromise;
}

// Detector options
const liveDetectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
const photoDetectorPrimary = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
const photoDetectorFallback = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 });

// ── Head-turn yaw ──────────────────────────────────────────────────────────────
function noseYawAngle(landmarks: faceapi.FaceLandmarks68): number {
  const nose = landmarks.getNose();
  const jaw  = landmarks.getJawOutline();
  const noseTip = nose[3];
  const left    = jaw[0];
  const right   = jaw[16];
  const midX    = (left.x + right.x) / 2;
  const halfW   = (right.x - left.x) / 2;
  if (halfW <= 0) return 0;
  return (noseTip.x - midX) / halfW;
}

// ── Mouth aspect ratio (smile / open mouth detection) ─────────────────────────
function mouthAspectRatio(landmarks: faceapi.FaceLandmarks68): number {
  const mouth = landmarks.getMouth(); // 20 points: outer 0-11, inner 12-19
  if (mouth.length < 20) return 0;
  // Horizontal: left corner (0) → right corner (6)
  const leftCorner  = mouth[0];
  const rightCorner = mouth[6];
  const horizontal = Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y);
  // Vertical: inner top (13, 14) vs inner bottom (17, 18)
  const topY    = (mouth[13].y + mouth[14].y) / 2;
  const bottomY = (mouth[17].y + mouth[18].y) / 2;
  const vertical = Math.abs(bottomY - topY);
  return horizontal > 0 ? vertical / horizontal : 0;
}

// ── LivenessProgress ──────────────────────────────────────────────────────────
export interface LivenessProgress {
  faceDetected: boolean;
  smiled: boolean;
  turned: boolean;
  message: string;
  percent: number;
}

export interface LivenessResult {
  descriptor: number[];
  snapshotDataUrl: string;
}

// Thresholds
const MAR_SMILE   = 0.28;  // mouth aspect ratio for an open smile
const YAW_TURN    = 0.15;  // 15% nose offset from centre counts as a turn
const TIMEOUT_MS  = 90_000;

/**
 * New liveness check — three steps:
 *  1. Face detected and stable (hold for ~1.5 s)
 *  2. Smile! (open mouth / show teeth)
 *  3. Turn head slightly in any direction
 */
export async function runLivenessCheck(
  videoEl: HTMLVideoElement,
  onProgress: (p: LivenessProgress) => void,
  signal?: AbortSignal,
): Promise<LivenessResult> {
  let smiled  = false;
  let turned  = false;
  let faceStableFrames = 0;
  const STABLE_FRAMES_REQUIRED = 8; // ~0.5 s at 60 ms/frame

  let bestSnapshot: { descriptor: Float32Array; canvas: HTMLCanvasElement; score: number } | null = null;
  const start = Date.now();

  while (true) {
    if (signal?.aborted) throw new Error('Liveness check cancelled');
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error('Verification timed out. Move to a brighter area, keep your face centred, and try again.');
    }

    const det = await faceapi
      .detectSingleFace(videoEl, liveDetectorOpts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      faceStableFrames = 0;
      onProgress({ faceDetected: false, smiled, turned, message: 'Centre your face in the circle — good lighting helps', percent: 0 });
      await sleep(80);
      continue;
    }

    faceStableFrames++;

    const mar = mouthAspectRatio(det.landmarks);
    const yaw = noseYawAngle(det.landmarks);

    if (mar > MAR_SMILE) smiled = true;
    if (Math.abs(yaw) > YAW_TURN) turned = true;

    // Track best snapshot
    if (!bestSnapshot || det.detection.score > bestSnapshot.score) {
      const canvas = document.createElement('canvas');
      canvas.width  = videoEl.videoWidth  || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      bestSnapshot = { descriptor: det.descriptor, canvas, score: det.detection.score };
    }

    // Progress calculation
    const stableProgress = Math.min(1, faceStableFrames / STABLE_FRAMES_REQUIRED) * 30;
    const smileProgress  = smiled ? 35 : 0;
    const turnProgress   = turned ? 35 : 0;
    const percent = Math.min(99, Math.round(stableProgress + smileProgress + turnProgress));

    // Step message
    let message: string;
    if (faceStableFrames < STABLE_FRAMES_REQUIRED) {
      message = 'Hold still — positioning your face...';
    } else if (!smiled) {
      message = '😄 Give us a big smile!';
    } else if (!turned) {
      message = '↔ Turn your head slightly left or right';
    } else {
      message = 'Almost done...';
    }

    onProgress({ faceDetected: true, smiled, turned, message, percent });

    if (faceStableFrames >= STABLE_FRAMES_REQUIRED && smiled && turned) {
      onProgress({ faceDetected: true, smiled, turned, message: 'Verified! ✓', percent: 100 });
      return {
        descriptor: Array.from(bestSnapshot!.descriptor),
        snapshotDataUrl: bestSnapshot!.canvas.toDataURL('image/jpeg', 0.85),
      };
    }

    await sleep(60);
  }
}

/** Detect a face in a photo file (profile photo comparison). */
export async function detectFaceInImageFile(file: File): Promise<{ descriptor: number[]; previewDataUrl: string }> {
  const previewDataUrl = await fileToDataUrl(file);
  const img = await loadImage(previewDataUrl);

  let det = await faceapi
    .detectSingleFace(img, photoDetectorPrimary)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!det) {
    det = await faceapi
      .detectSingleFace(img, photoDetectorFallback)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  if (!det) {
    throw new Error("No face found in the photo. Use good lighting, avoid glare, and ensure your face is clearly visible.");
  }

  return {
    descriptor: Array.from(det.descriptor),
    previewDataUrl: shrinkDataUrl(img, 800),
  };
}

/** Detect a face in a data URL (used for profile photo comparison from URL). */
export async function detectFaceInDataUrl(dataUrl: string): Promise<number[] | null> {
  try {
    const img = await loadImage(dataUrl);
    const det = await faceapi
      .detectSingleFace(img, photoDetectorPrimary)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return null;
    return Array.from(det.descriptor);
  } catch {
    return null;
  }
}

export function compareDescriptors(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function shrinkDataUrl(img: HTMLImageElement, maxWidth: number): string {
  const ratio = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width  * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}
