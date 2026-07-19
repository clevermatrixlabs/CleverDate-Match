/**
 * Azure Face API client — Microsoft Cognitive Services
 *
 * FREE TIER (F0): 30,000 transactions/month, 20 calls/minute.
 * ⚠️  SCALING NOTE: When monthly sign-ups approach 30,000, upgrade to the S0
 *     paid tier ($1.50 / 1,000 calls) or evaluate an alternative provider.
 *     Do NOT assume the free tier is unlimited.
 *
 * Required environment variables:
 *   AZURE_FACE_API_KEY      — subscription key from Azure portal
 *   AZURE_FACE_API_ENDPOINT — e.g. https://<region>.api.cognitive.microsoft.com
 *
 * API docs: https://learn.microsoft.com/en-us/rest/api/face/
 */

const KEY      = process.env.AZURE_FACE_API_KEY      ?? '';
const ENDPOINT = (process.env.AZURE_FACE_API_ENDPOINT ?? '').replace(/\/$/, '');

export const azureConfigured = (): boolean => !!(KEY && ENDPOINT);

// Use the best recognition + detection models available on the free tier.
const DETECT_URL =
  `${ENDPOINT}/face/v1.0/detect` +
  `?returnFaceId=true` +
  `&detectionModel=detection_03` +
  `&recognitionModel=recognition_04`;

const VERIFY_URL = `${ENDPOINT}/face/v1.0/verify`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AzureDetectResult {
  faceId: string;
  faceRectangle: { top: number; left: number; width: number; height: number };
}

export interface AzureVerifyResult {
  isIdentical: boolean;
  confidence: number; // 0–1
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a base64 data-URL or raw base64 string to a Buffer.
 * Strips "data:<mime>;base64," prefix if present.
 */
function base64ToBuffer(input: string): Buffer {
  const raw = input.includes(',') ? input.split(',')[1] : input;
  return Buffer.from(raw, 'base64');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the largest face in an image (provided as base64).
 * Returns the faceId string, or null if no face found or on error.
 */
export async function detectFace(imageBase64: string): Promise<string | null> {
  if (!azureConfigured()) {
    console.warn('[AzureFace] Not configured — skipping detect');
    return null;
  }
  try {
    const body = base64ToBuffer(imageBase64);
    const res  = await fetch(DETECT_URL, {
      method:  'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/octet-stream',
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[AzureFace] detect HTTP ${res.status}:`, err);
      return null;
    }

    const faces: AzureDetectResult[] = await res.json();
    if (!faces || faces.length === 0) return null;

    // Return the faceId of the largest face (by area)
    const largest = faces.reduce((best, f) => {
      const area = f.faceRectangle.width * f.faceRectangle.height;
      const bestArea = best.faceRectangle.width * best.faceRectangle.height;
      return area > bestArea ? f : best;
    });
    return largest.faceId;

  } catch (e) {
    console.error('[AzureFace] detect error:', e);
    return null;
  }
}

/**
 * Compare two face IDs returned by detectFace().
 * Returns null if either faceId is missing or an API error occurs.
 *
 * Confidence threshold guidance (Azure docs):
 *   ≥ 0.50  same person (low confidence)
 *   ≥ 0.70  same person (high confidence)
 *   < 0.50  different people
 */
export async function verifyFaces(
  faceId1: string,
  faceId2: string,
): Promise<AzureVerifyResult | null> {
  if (!azureConfigured()) {
    console.warn('[AzureFace] Not configured — skipping verify');
    return null;
  }
  try {
    const res = await fetch(VERIFY_URL, {
      method:  'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ faceId1, faceId2 }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[AzureFace] verify HTTP ${res.status}:`, err);
      return null;
    }

    return (await res.json()) as AzureVerifyResult;
  } catch (e) {
    console.error('[AzureFace] verify error:', e);
    return null;
  }
}

/**
 * High-level: compare a selfie against multiple profile photos.
 *
 * Returns:
 *   { match: 'confirmed', confidence }  — same person
 *   { match: 'borderline', confidence } — borderline (manual review)
 *   { match: 'rejected', confidence }   — clearly different person
 *   { match: 'no_face' }                — Azure couldn't detect a face
 *   { match: 'unconfigured' }           — Azure credentials not set
 */
export async function compareSelfieToPhotos(
  selfieBase64: string,
  photoBase64Array: string[],
): Promise<{ match: 'confirmed' | 'borderline' | 'rejected' | 'no_face' | 'unconfigured'; confidence?: number }> {

  if (!azureConfigured()) {
    return { match: 'unconfigured' };
  }

  // Detect face in selfie
  const selfieFaceId = await detectFace(selfieBase64);
  if (!selfieFaceId) {
    return { match: 'no_face' };
  }

  // No profile photos yet (new user still uploading) — skip photo comparison
  const validPhotos = photoBase64Array.filter(Boolean);
  if (validPhotos.length === 0) {
    // No photos to compare against — treat as confirmed for now
    // Admin can review the selfie manually
    return { match: 'confirmed', confidence: 1.0 };
  }

  // Detect faces in profile photos, compare each against selfie
  let bestConfidence = 0;

  for (const photo of validPhotos) {
    const photoFaceId = await detectFace(photo);
    if (!photoFaceId) continue;

    const result = await verifyFaces(selfieFaceId, photoFaceId);
    if (!result) continue;

    if (result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
    }

    // Short-circuit on high confidence match
    if (result.confidence >= 0.70) break;
  }

  // Classify result
  // Azure threshold: >= 0.50 is a match, but we're stricter for anti-catfishing
  if (bestConfidence === 0) {
    // Couldn't detect faces in any profile photo — send for manual review
    return { match: 'borderline', confidence: 0 };
  }
  if (bestConfidence >= 0.50) {
    return { match: 'confirmed', confidence: bestConfidence };
  }
  if (bestConfidence >= 0.35) {
    return { match: 'borderline', confidence: bestConfidence };
  }
  return { match: 'rejected', confidence: bestConfidence };
}
