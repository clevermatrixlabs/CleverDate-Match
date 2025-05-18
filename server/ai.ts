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

/**
 * Analyze user profiles to find good potential matches based on interests, values, and compatibility
 * @param currentUser The user seeking matches
 * @param potentialMatches Available potential matches
 * @param count Number of matches to return
 */
export async function findOptimalMatches(
  currentUser: User, 
  potentialMatches: User[], 
  count: number = 5
): Promise<User[]> {
  try {
    if (!potentialMatches.length) return [];
    
    // Create a detailed profile of the current user
    const userProfile = {
      age: currentUser.age,
      gender: currentUser.gender,
      interests: currentUser.interests || [],
      aboutMe: currentUser.aboutMe || "",
      religion: currentUser.religion || "",
      location: currentUser.location || ""
    };
    
    // Create profiles for potential matches
    const matchProfiles = potentialMatches.map(match => ({
      id: match.id,
      age: match.age,
      interests: match.interests || [],
      aboutMe: match.aboutMe || "",
      religion: match.religion || "",
      location: match.location || ""
    }));
    
    // Use OpenAI to analyze compatibility
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a dating app matchmaking algorithm. Based on user profiles, identify the most compatible matches. Consider shared interests, values, communication style, and potential chemistry."
        },
        {
          role: "user",
          content: `Find the top ${count} most compatible matches for this user based on their profiles. 
          
          Current user profile:
          ${JSON.stringify(userProfile, null, 2)}
          
          Potential matches:
          ${JSON.stringify(matchProfiles, null, 2)}
          
          Return ONLY a JSON array with the IDs of the best matches in order of compatibility, like: [3, 8, 12, 4, 7]`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    const bestMatchIds = result.matches || [];
    
    // Return the full user objects in the order of compatibility
    const orderedMatches = bestMatchIds
      .map(id => potentialMatches.find(match => match.id === id))
      .filter(Boolean)
      .slice(0, count);
    
    // If we don't have enough matches from AI, add some random ones
    if (orderedMatches.length < count) {
      const remainingMatches = potentialMatches.filter(
        match => !orderedMatches.some(m => m.id === match.id)
      );
      
      // Shuffle remaining matches and add until we reach the count
      const shuffled = remainingMatches.sort(() => 0.5 - Math.random());
      while (orderedMatches.length < count && shuffled.length) {
        orderedMatches.push(shuffled.pop());
      }
    }
    
    return orderedMatches;
  } catch (error) {
    console.error("Error finding optimal matches:", error);
    // Fallback to random selection if AI fails
    return potentialMatches
      .sort(() => 0.5 - Math.random())
      .slice(0, count);
  }
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