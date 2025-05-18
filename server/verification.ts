import { verifyPersonImage, verifyPersonVideo } from './ai';

export interface VerificationResult {
  success: boolean;
  message: string;
}

/**
 * Verify user identity using AI analysis of image and video
 * @param verificationData Base64 encoded image/video data
 */
export async function verify(verificationData: string): Promise<VerificationResult> {
  try {
    // In a real app, we would:
    // 1. Process both image and video verification
    // 2. Check for facial matches between the image and video
    // 3. Verify eye movements in the video to ensure liveness
    
    // For this demo, we'll verify using the AI service but simplify the process
    const imageResult = await verifyPersonImage(verificationData);
    
    if (!imageResult.isHuman || imageResult.confidence < 0.7) {
      return {
        success: false,
        message: imageResult.message || "Verification failed: Could not confirm human identity"
      };
    }
    
    // We would normally analyze the video separately, but for demo purposes
    // we'll simulate a successful video verification
    const videoResult = await verifyPersonVideo(verificationData);
    
    if (!videoResult.isHuman || videoResult.confidence < 0.7) {
      return {
        success: false,
        message: videoResult.message || "Verification failed: Could not confirm video identity"
      };
    }
    
    return {
      success: true,
      message: "Verification successful"
    };
  } catch (error: any) {
    console.error("Verification error:", error.message);
    return {
      success: false,
      message: `Verification failed: ${error.message}`
    };
  }
}
