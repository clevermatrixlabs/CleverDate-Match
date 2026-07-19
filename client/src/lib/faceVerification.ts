/**
 * Client-side liveness capture — no local ML.
 *
 * face-api.js has been removed. All face comparison now runs server-side
 * via Azure Face API (Cognitive Services). This module only:
 *   1. Manages the camera stream
 *   2. Guides the user through a 3-step liveness prompt (timed)
 *   3. Captures the best frame as a JPEG data-URL and returns it
 *
 * The captured image is sent to POST /api/verification where Azure
 * compares it against the user's profile photos.
 */

export interface LivenessProgress {
  step: 'centering' | 'smile' | 'turn' | 'capturing' | 'done';
  message: string;
  percent: number;
}

export interface LivenessResult {
  snapshotDataUrl: string;
}

const STEP_DURATION_MS = 2_800; // time spent on each liveness instruction

/**
 * Run a simple timed liveness capture.
 *
 * Steps:
 *  1. Centre your face  (~2.8 s)
 *  2. Smile!            (~2.8 s)
 *  3. Turn head         (~2.8 s)
 *  4. Capture frame
 *
 * @param videoEl  A playing <video> element with the camera stream attached.
 * @param onProgress  Called on each progress update so the UI can reflect state.
 * @param signal  Optional AbortSignal to cancel the check.
 */
export async function runLivenessCheck(
  videoEl: HTMLVideoElement,
  onProgress: (p: LivenessProgress) => void,
  signal?: AbortSignal,
): Promise<LivenessResult> {

  const abort = () => signal?.aborted;

  // ── Wait until the video element has real frame dimensions ────────────────
  await waitForVideoReady(videoEl);
  if (abort()) throw new Error('Liveness check cancelled');

  // ── Step 1: Centre ────────────────────────────────────────────────────────
  onProgress({ step: 'centering', message: 'Centre your face in the circle', percent: 10 });
  await sleep(STEP_DURATION_MS);
  if (abort()) throw new Error('Liveness check cancelled');

  // ── Step 2: Smile ─────────────────────────────────────────────────────────
  onProgress({ step: 'smile', message: '😄 Give us a big smile!', percent: 40 });
  await sleep(STEP_DURATION_MS);
  if (abort()) throw new Error('Liveness check cancelled');

  // ── Step 3: Head turn ─────────────────────────────────────────────────────
  onProgress({ step: 'turn', message: '↔ Turn your head slightly left or right', percent: 70 });
  await sleep(STEP_DURATION_MS);
  if (abort()) throw new Error('Liveness check cancelled');

  // ── Step 4: Capture ───────────────────────────────────────────────────────
  onProgress({ step: 'capturing', message: 'Capturing…', percent: 90 });

  const snapshot = captureVideoFrame(videoEl);
  if (!snapshot) {
    throw new Error('Could not capture a frame from your camera. Please try again.');
  }

  onProgress({ step: 'done', message: 'Sending to verification…', percent: 100 });

  return { snapshotDataUrl: snapshot };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForVideoReady(videoEl: HTMLVideoElement, timeoutMs = 12_000): Promise<void> {
  if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('Camera took too long to start. Check your camera permissions and try again.'));
    }, timeoutMs);

    let done = false;
    function check() {
      if (done) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        done = true;
        cleanup();
        resolve();
      }
    }

    function cleanup() {
      clearTimeout(deadline);
      clearInterval(poll);
      videoEl.removeEventListener('loadeddata',     check);
      videoEl.removeEventListener('loadedmetadata', check);
      videoEl.removeEventListener('canplay',        check);
      videoEl.removeEventListener('playing',        check);
    }

    const poll = setInterval(check, 80);
    videoEl.addEventListener('loadedmetadata', check);
    videoEl.addEventListener('loadeddata',     check);
    videoEl.addEventListener('canplay',        check);
    videoEl.addEventListener('playing',        check);
    check();
  });
}

function captureVideoFrame(videoEl: HTMLVideoElement): string | null {
  const w = videoEl.videoWidth  || 640;
  const h = videoEl.videoHeight || 480;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.90);
}
