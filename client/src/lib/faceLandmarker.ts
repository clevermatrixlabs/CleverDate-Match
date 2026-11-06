import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let faceLandmarkerInstance: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarkerInstance) return faceLandmarkerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm"
    );

    faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });

    return faceLandmarkerInstance;
  })();

  return initPromise;
}

export interface FaceBiometricMetrics {
  faceDetected: boolean;
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  bothEyesClosed: boolean;
  mouthSmile: number;
  jawOpen: number;
  headYawDegrees: number; // Negative = turned right, Positive = turned left
  headPitchDegrees: number; // Negative = looking down, Positive = looking up
  faceCentered: boolean;
}

/**
 * Extract 3D head pose and facial action units (blink, smile, head rotation)
 * using industry-standard MediaPipe FaceMesh landmarks and blendshapes.
 */
export function extractBiometricMetrics(
  result: any,
  viewportWidth = 640,
  viewportHeight = 480
): FaceBiometricMetrics {
  const defaultMetrics: FaceBiometricMetrics = {
    faceDetected: false,
    eyeBlinkLeft: 0,
    eyeBlinkRight: 0,
    bothEyesClosed: false,
    mouthSmile: 0,
    jawOpen: 0,
    headYawDegrees: 0,
    headPitchDegrees: 0,
    faceCentered: false,
  };

  if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
    return defaultMetrics;
  }

  const landmarks = result.faceLandmarks[0];
  const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

  // Helper to get blendshape score by categoryName
  const getCategoryScore = (name: string): number => {
    const shape = blendshapes.find((s: any) => s.categoryName === name);
    return shape ? shape.score : 0;
  };

  const eyeBlinkLeft = getCategoryScore("eyeBlinkLeft");
  const eyeBlinkRight = getCategoryScore("eyeBlinkRight");
  const mouthSmileLeft = getCategoryScore("mouthSmileLeft");
  const mouthSmileRight = getCategoryScore("mouthSmileRight");
  const jawOpen = getCategoryScore("jawOpen");

  // Calculate 3D Head Pose (Yaw and Pitch) from key 3D facial landmarks:
  // Landmark 1: Nose tip
  // Landmark 33: Left eye outer corner
  // Landmark 263: Right eye outer corner
  // Landmark 152: Chin
  // Landmark 10: Forehead center
  const noseTip = landmarks[1];
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const chin = landmarks[152];
  const forehead = landmarks[10];

  let headYawDegrees = 0;
  let headPitchDegrees = 0;

  if (noseTip && leftEyeOuter && rightEyeOuter) {
    const eyeMidpointX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const eyeDistance = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
    // Yaw: displacement of nose from the eye midpoint relative to inter-ocular distance
    const horizontalRatio = (noseTip.x - eyeMidpointX) / (eyeDistance || 0.1);
    headYawDegrees = horizontalRatio * 75; // Approximation in degrees (-45° to +45°)
  }

  if (noseTip && chin && forehead) {
    const verticalMidpointY = (forehead.y + chin.y) / 2;
    const faceHeight = Math.abs(chin.y - forehead.y);
    const verticalRatio = (noseTip.y - verticalMidpointY) / (faceHeight || 0.1);
    headPitchDegrees = -verticalRatio * 60;
  }

  // Centering check: nose tip within central 50% box of the viewport (normalized 0.25 to 0.75)
  const faceCentered =
    noseTip.x > 0.30 &&
    noseTip.x < 0.70 &&
    noseTip.y > 0.25 &&
    noseTip.y < 0.75;

  return {
    faceDetected: true,
    eyeBlinkLeft,
    eyeBlinkRight,
    bothEyesClosed: eyeBlinkLeft > 0.45 && eyeBlinkRight > 0.45,
    mouthSmile: (mouthSmileLeft + mouthSmileRight) / 2,
    jawOpen,
    headYawDegrees,
    headPitchDegrees,
    faceCentered,
  };
}
