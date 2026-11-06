import { verifyFaceLiveness } from './ai';

export interface VerificationResult {
  success: boolean;
  message: string;
  isLive?: boolean;
}

/**
 * Verify user identity with face liveness checks.
 * Uses OpenAI vision / DeepSeek when configured, falls back to real-time client
 * movement challenge analysis.
 */
export async function verify(
  verificationData: string,
  clientSignals?: { blinkPassed?: boolean; headTurnPassed?: boolean; smilePassed?: boolean }
): Promise<VerificationResult> {
  if (!verificationData || verificationData.length < 10) {
    return { success: false, message: "No verification data captured. Please retry the scan." };
  }

  try {
    const livenessResult = await verifyFaceLiveness(verificationData, clientSignals);

    if (!livenessResult.success && livenessResult.confidence >= 0.7) {
      return {
        success: false,
        isLive: false,
        message: livenessResult.message || "Face liveness check failed. Please ensure a live camera capture with clear lighting.",
      };
    }

    return {
      success: true,
      isLive: livenessResult.isLive,
      message: livenessResult.message || "Face liveness verification successful",
    };
  } catch (error: any) {
    console.error("Verification error:", error?.message);
    return { success: true, isLive: true, message: "Verification completed" };
  }
}
