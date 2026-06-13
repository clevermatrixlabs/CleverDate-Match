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

// Higher resolution for better accuracy on mobile cameras
const liveDetectorOpts  = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
// For ID photos: start with the high-accuracy SSD model, lower threshold since photos are sharp
const idDetectorPrimary = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
// Fallback: TinyFaceDetector with very low threshold for harder ID photos
const idDetectorFallback = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 });

function eyeAspectRatio(eye: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const v1 = dist(eye[1], eye[5]);
  const v2 = dist(eye[2], eye[4]);
  const h  = dist(eye[0], eye[3]);
  return h > 0 ? (v1 + v2) / (2 * h) : 0.3;
}

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

export interface LivenessProgress {
  blinks: number;
  turnedLeft: boolean;
  turnedRight: boolean;
  faceDetected: boolean;
  message: string;
  percent: number;
}

export interface LivenessResult {
  descriptor: number[];
  snapshotDataUrl: string;
}

const REQUIRED_BLINKS = 2;

// EAR thresholds — tuned for mobile cameras with variable lighting
const EAR_CLOSED       = 0.22;  // eye "closed" below this
const EAR_OPEN         = 0.27;  // eye "open" again above this

// Head-turn thresholds — small turns are enough on mobile
const YAW_LEFT         = -0.16;
const YAW_RIGHT        =  0.16;

// Min ms between two counted blinks to avoid double-counting
const BLINK_COOLDOWN_MS = 400;

export async function runLivenessCheck(
  videoEl: HTMLVideoElement,
  onProgress: (p: LivenessProgress) => void,
  signal?: AbortSignal,
): Promise<LivenessResult> {
  let blinks = 0;
  let eyeState: 'open' | 'closed' = 'open';
  let lastBlinkAt = 0;
  let turnedLeft  = false;
  let turnedRight = false;
  let bestSnapshot: { descriptor: Float32Array; canvas: HTMLCanvasElement; score: number } | null = null;

  const start      = Date.now();
  const TIMEOUT_MS = 90_000; // 90 s — extra time for slower phones

  while (true) {
    if (signal?.aborted) throw new Error('Liveness check cancelled');
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error('Verification timed out. Move to a brighter area, keep your face centered, and try again.');
    }

    const det = await faceapi
      .detectSingleFace(videoEl, liveDetectorOpts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    const blinkProgress = Math.min(1, blinks / REQUIRED_BLINKS) * 50;
    const turnProgress  = ((turnedLeft ? 1 : 0) + (turnedRight ? 1 : 0)) * 25;
    const percent       = Math.min(99, Math.round(blinkProgress + turnProgress));

    if (!det) {
      onProgress({
        blinks, turnedLeft, turnedRight,
        faceDetected: false,
        message: 'Center your face in the circle — good lighting helps',
        percent,
      });
      await sleep(80);
      continue;
    }

    const lm  = det.landmarks;
    const leftEAR  = eyeAspectRatio(lm.getLeftEye());
    const rightEAR = eyeAspectRatio(lm.getRightEye());
    const ear = (leftEAR + rightEAR) / 2;
    const yaw = noseYawAngle(lm);
    const now = Date.now();

    // Blink state machine with cooldown
    if (eyeState === 'open' && ear < EAR_CLOSED) {
      eyeState = 'closed';
    } else if (eyeState === 'closed' && ear > EAR_OPEN) {
      eyeState = 'open';
      if (now - lastBlinkAt >= BLINK_COOLDOWN_MS) {
        blinks += 1;
        lastBlinkAt = now;
      }
    }

    // Head turns
    if (yaw < YAW_LEFT)  turnedLeft  = true;
    if (yaw > YAW_RIGHT) turnedRight = true;

    // Keep the best-quality snapshot for the face descriptor
    if (!bestSnapshot || det.detection.score > bestSnapshot.score) {
      const canvas = document.createElement('canvas');
      canvas.width  = videoEl.videoWidth  || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      bestSnapshot = { descriptor: det.descriptor, canvas, score: det.detection.score };
    }

    let message = 'Hold still...';
    if (blinks < REQUIRED_BLINKS) message = `Blink slowly and fully (${blinks}/${REQUIRED_BLINKS} done)`;
    else if (!turnedLeft)         message = '↩ Slowly turn your head LEFT';
    else if (!turnedRight)        message = '↪ Slowly turn your head RIGHT';
    else                          message = 'Almost done...';

    onProgress({ blinks, turnedLeft, turnedRight, faceDetected: true, message, percent });

    if (blinks >= REQUIRED_BLINKS && turnedLeft && turnedRight) {
      onProgress({ blinks, turnedLeft, turnedRight, faceDetected: true, message: 'Verified! ✓', percent: 100 });
      return {
        descriptor: Array.from(bestSnapshot!.descriptor),
        snapshotDataUrl: bestSnapshot!.canvas.toDataURL('image/jpeg', 0.85),
      };
    }

    await sleep(60);
  }
}

/** Detect a face in an ID document photo.
 *  Tries SSD Mobilenet first (better for photos), falls back to TinyFaceDetector
 *  with a relaxed threshold if the first pass fails. */
export async function detectFaceInImageFile(file: File): Promise<{ descriptor: number[]; previewDataUrl: string }> {
  const previewDataUrl = await fileToDataUrl(file);
  const img = await loadImage(previewDataUrl);

  // Pass 1 — SSD Mobilenet (high accuracy on still photos)
  let det = await faceapi
    .detectSingleFace(img, idDetectorPrimary)
    .withFaceLandmarks()
    .withFaceDescriptor();

  // Pass 2 — TinyFaceDetector with higher inputSize and lower threshold
  if (!det) {
    det = await faceapi
      .detectSingleFace(img, idDetectorFallback)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }

  if (!det) {
    throw new Error(
      "No face found on the ID photo. Tips: ensure the photo side is face-up, use good lighting, avoid glare, " +
      "and make sure your face on the ID is clearly visible and not cropped."
    );
  }

  return {
    descriptor: Array.from(det.descriptor),
    previewDataUrl: shrinkDataUrl(img, 800),
  };
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
