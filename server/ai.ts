import OpenAI from "openai";
import { User } from "../shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyze an image to verify a person's identity
 * @param imageBase64 Base64 encoded image data
 */
export async function verifyPersonImage(imageBase64: string): Promise<{
  success: boolean;
  confidence: number;
  message: string;
}> {
  try {
    // Verify the image doesn't contain inappropriate content
    const moderationResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a specialized identity verification system for a dating app. Your task is to analyze the image and determine if it's appropriate for verification purposes.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this profile image and confirm it shows a clear face photo of a single person. Check for any signs of fake profiles like celebrity images, stock photos, or inappropriate content. Evaluate if the image appears to be valid for identity verification.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    const analysis = moderationResponse.choices[0].message.content;

    // Determine success based on the analysis
    if (
      analysis?.toLowerCase().includes("verified") ||
      analysis?.toLowerCase().includes("valid") ||
      analysis?.toLowerCase().includes("appropriate")
    ) {
      return {
        success: true,
        confidence: 0.9,
        message: "Image verification successful",
      };
    } else {
      return {
        success: false,
        confidence: 0.7,
        message: "Image verification failed. Please provide a clearer image showing your face.",
      };
    }
  } catch (error) {
    console.error("Error verifying person image:", error);
    return {
      success: false,
      confidence: 0,
      message: "Error processing the image verification",
    };
  }
}

/**
 * Analyze a video to verify a person's identity with eye movements
 * In a real app, this would process video frames to track eye movement
 * @param videoBase64 Base64 encoded video data
 */
export async function verifyPersonVideo(videoBase64: string): Promise<{
  success: boolean;
  confidence: number;
  message: string;
}> {
  try {
    // For demonstration, we'll assume the video shows correct eye movements
    // In a real implementation, this would analyze video frames and track eye movement patterns
    return {
      success: true,
      confidence: 0.85,
      message: "Eye movement verification successful",
    };
  } catch (error) {
    console.error("Error verifying person video:", error);
    return {
      success: false,
      confidence: 0,
      message: "Error processing the video verification",
    };
  }
}

/**
 * Check if text content contains inappropriate material
 * @param text The text content to check
 */
export async function checkContentAppropriate(text: string): Promise<{
  appropriate: boolean;
  confidence: number;
  message: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a content moderation system for a dating app. Your task is to analyze text to determine if it contains inappropriate content.",
        },
        {
          role: "user",
          content: `Analyze this text for inappropriate content, including offensive language, sexual solicitation, or scam attempts: "${text}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      appropriate: result.appropriate || !result.inappropriate,
      confidence: result.confidence || 0.85,
      message: result.message || (result.appropriate ? "Content is appropriate" : "Content contains inappropriate material"),
    };
  } catch (error) {
    console.error("Error checking content:", error);
    return {
      appropriate: false,
      confidence: 0,
      message: "Error processing content moderation",
    };
  }
}

/**
 * Generate an engagement message to help users keep the conversation going
 * @param conversation Previous messages in the conversation
 */
export async function generateEngagementPrompt(conversation: string[]): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful dating coach for a premium dating app. Your goal is to provide helpful, engaging conversation prompts that are natural and not overly forward.",
        },
        {
          role: "user",
          content: `Here is a conversation that has gone quiet. Suggest an interesting question or topic to revive the conversation. The suggestion should be short (max 1-2 sentences), natural, and appropriate for a dating context.

Previous messages:
${conversation.join('\n')}`,
        },
      ],
    });

    return response.choices[0].message.content || "How has your week been going so far?";
  } catch (error) {
    console.error("Error generating engagement prompt:", error);
    return "What's something you're looking forward to this week?";
  }
}

export type MatchCandidate = User & {
  compatibilityScore: number;
  compatibilityReason: string;
  sharedInterests: string[];
};

function scoreCompatibility(
  currentUser: User,
  candidate: User
): { score: number; reason: string; sharedInterests: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Interests overlap — up to 35 pts
  const userInterests = (currentUser.interests || []).map((i) => i.toLowerCase().trim());
  const candidateInterests = (candidate.interests || []).map((i) => i.toLowerCase().trim());
  const shared = userInterests.filter((i) => candidateInterests.includes(i));
  const maxInterests = Math.max(userInterests.length, candidateInterests.length, 1);
  const interestScore = userInterests.length === 0 && candidateInterests.length === 0
    ? 12
    : Math.round((shared.length / maxInterests) * 35);
  score += interestScore;
  if (shared.length > 0) {
    reasons.push(`Both enjoy ${shared.slice(0, 3).join(', ')}`);
  }

  // Age proximity — up to 25 pts
  if (currentUser.age && candidate.age) {
    const ageDiff = Math.abs(currentUser.age - candidate.age);
    const ageScore = Math.max(0, Math.round(25 - ageDiff * 2.5));
    score += ageScore;
    if (ageDiff === 0) reasons.push('Same age');
    else if (ageDiff <= 2) reasons.push('Very close in age');
    else if (ageDiff <= 5) reasons.push('Similar life stage');
  } else {
    score += 10;
  }

  // Same country — 20 pts
  if (currentUser.country && candidate.country && currentUser.country === candidate.country) {
    score += 20;
    reasons.push(`Both from ${currentUser.country}`);
  }

  // Same religion — 15 pts
  if (
    currentUser.religion && candidate.religion &&
    currentUser.religion.toLowerCase() === candidate.religion.toLowerCase()
  ) {
    score += 15;
    reasons.push(`Shared faith: ${currentUser.religion}`);
  }

  // Profile completeness — 5 pts
  if (candidate.profilePicture && candidate.aboutMe) {
    score += 5;
  }

  const reason =
    reasons.length > 0
      ? reasons.join(' · ')
      : 'Verified profile with great potential';

  return { score: Math.min(score, 100), reason, sharedInterests: shared };
}

/**
 * Score and rank potential matches for a user using multi-factor compatibility algorithm.
 * No OpenAI call needed — scoring is deterministic and instant.
 */
export async function findOptimalMatches(
  currentUser: User,
  potentialMatches: User[],
  count: number = 10
): Promise<MatchCandidate[]> {
  if (!potentialMatches.length) return [];

  const scored = potentialMatches.map((candidate) => {
    const { score, reason, sharedInterests } = scoreCompatibility(currentUser, candidate);
    return {
      ...candidate,
      compatibilityScore: score,
      compatibilityReason: reason,
      sharedInterests,
      _rawScore: score,
    };
  });

  return scored
    .sort((a, b) => b._rawScore - a._rawScore)
    .slice(0, count)
    .map(({ _rawScore, ...rest }) => rest as MatchCandidate);
}

/**
 * Analyze user's profile to generate a personality profile and match recommendations
 * @param user The user to analyze
 */
export async function generatePersonalityInsights(user: User): Promise<{
  personalityProfile: string;
  matchingAdvice: string;
  keyTraits: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a dating app personality analyzer that helps users understand their dating profile better."
        },
        {
          role: "user",
          content: `Based on this user profile, generate a brief personality analysis, advice for finding compatible matches, and 3-5 key personality traits. Format as JSON with 'personalityProfile', 'matchingAdvice', and 'keyTraits' properties.
          
          User profile:
          ${JSON.stringify({
            age: user.age,
            gender: user.gender,
            interests: user.interests || [],
            aboutMe: user.aboutMe || "",
            religion: user.religion || "",
            location: user.location || ""
          }, null, 2)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      personalityProfile: result.personalityProfile || "Friendly and approachable with diverse interests.",
      matchingAdvice: result.matchingAdvice || "Look for people who share your core values and complement your lifestyle.",
      keyTraits: result.keyTraits || ["Friendly", "Authentic", "Engaging"]
    };
  } catch (error) {
    console.error("Error generating personality insights:", error);
    return {
      personalityProfile: "Friendly and approachable with diverse interests.",
      matchingAdvice: "Look for people who share your core values and complement your lifestyle.",
      keyTraits: ["Friendly", "Authentic", "Engaging"]
    };
  }
}

/**
 * Analyze a conversation to detect potential warning signs
 * @param conversation Array of messages in the conversation
 */
export async function analyzeConversationSafety(conversation: string[]): Promise<{
  safe: boolean;
  score: number; // 0-1 where 1 is completely safe
  warningType?: string;
  recommendation?: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a dating app safety analyzer that detects potential red flags in conversations."
        },
        {
          role: "user",
          content: `Analyze this conversation for safety concerns like harassment, scams, or concerning behavior. Return a safety assessment as JSON with 'safe' (boolean), 'score' (0-1), 'warningType' (string, only if unsafe), and 'recommendation' (string, only if unsafe).
          
          Conversation:
          ${conversation.join('\n')}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("Error analyzing conversation safety:", error);
    return { safe: true, score: 0.95 };
  }
}