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
    modelsReady = true;
  })();

  return loadPromise;
}

const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

function eyeAspectRatio(eye: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const v1 = dist(eye[1], eye[5]);
  const v2 = dist(eye[2], eye[4]);
  const h = dist(eye[0], eye[3]);
  return (v1 + v2) / (2 * h);
}

function noseYawAngle(landmarks: faceapi.FaceLandmarks68): number {
  const nose = landmarks.getNose();
  const jaw = landmarks.getJawOutline();
  const noseTip = nose[3];
  const left = jaw[0];
  const right = jaw[16];
  const midX = (left.x + right.x) / 2;
  const halfW = (right.x - left.x) / 2;
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
const EAR_CLOSED = 0.21;
const EAR_OPEN = 0.28;
const YAW_LEFT = -0.25;
const YAW_RIGHT = 0.25;

export async function runLivenessCheck(
  videoEl: HTMLVideoElement,
  onProgress: (p: LivenessProgress) => void,
  signal?: AbortSignal,
): Promise<LivenessResult> {
  let blinks = 0;
  let eyeState: 'open' | 'closed' = 'open';
  let turnedLeft = false;
  let turnedRight = false;
  let bestSnapshot: { descriptor: Float32Array; canvas: HTMLCanvasElement; score: number } | null = null;

  const start = Date.now();
  const TIMEOUT_MS = 45_000;

  while (true) {
    if (signal?.aborted) throw new Error('Liveness check cancelled');
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error('Verification timed out — please try again with better lighting and stay in frame.');
    }

    const det = await faceapi
      .detectSingleFace(videoEl, detectorOpts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    const blinkProgress = Math.min(1, blinks / REQUIRED_BLINKS) * 50;
    const turnProgress = ((turnedLeft ? 1 : 0) + (turnedRight ? 1 : 0)) * 25;
    const percent = Math.min(99, Math.round(blinkProgress + turnProgress));

    if (!det) {
      onProgress({
        blinks,
        turnedLeft,
        turnedRight,
        faceDetected: false,
        message: 'Center your face in the circle',
        percent,
      });
      await sleep(200);
      continue;
    }

    const lm = det.landmarks;
    const ear = (eyeAspectRatio(lm.getLeftEye()) + eyeAspectRatio(lm.getRightEye())) / 2;
    const yaw = noseYawAngle(lm);

    if (eyeState === 'open' && ear < EAR_CLOSED) {
      eyeState = 'closed';
    } else if (eyeState === 'closed' && ear > EAR_OPEN) {
      eyeState = 'open';
      blinks += 1;
    }

    if (yaw < YAW_LEFT) turnedLeft = true;
    if (yaw > YAW_RIGHT) turnedRight = true;

    if (!bestSnapshot || det.detection.score > bestSnapshot.score) {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      bestSnapshot = {
        descriptor: det.descriptor,
        canvas,
        score: det.detection.score,
      };
    }

    let message = 'Hold still...';
    if (blinks < REQUIRED_BLINKS) message = `Blink your eyes (${blinks}/${REQUIRED_BLINKS})`;
    else if (!turnedLeft) message = 'Turn your head slightly LEFT';
    else if (!turnedRight) message = 'Turn your head slightly RIGHT';
    else message = 'Almost done...';

    onProgress({
      blinks,
      turnedLeft,
      turnedRight,
      faceDetected: true,
      message,
      percent,
    });

    if (blinks >= REQUIRED_BLINKS && turnedLeft && turnedRight) {
      onProgress({
        blinks,
        turnedLeft,
        turnedRight,
        faceDetected: true,
        message: 'Verified!',
        percent: 100,
      });
      return {
        descriptor: Array.from(bestSnapshot!.descriptor),
        snapshotDataUrl: bestSnapshot!.canvas.toDataURL('image/jpeg', 0.7),
      };
    }

    await sleep(150);
  }
}

export async function detectFaceInImageFile(file: File): Promise<{ descriptor: number[]; previewDataUrl: string }> {
  const previewDataUrl = await fileToDataUrl(file);
  const img = await loadImage(previewDataUrl);

  const det = await faceapi
    .detectSingleFace(img, detectorOpts)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!det) {
    throw new Error("Couldn't detect a face on your ID document. Please use a clear, well-lit photo where the face is visible.");
  }

  return {
    descriptor: Array.from(det.descriptor),
    previewDataUrl: shrinkDataUrl(img, 600),
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
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function shrinkDataUrl(img: HTMLImageElement, maxWidth: number): string {
  const ratio = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}
