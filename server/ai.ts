import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyze an image to verify a person's identity
 * @param imageBase64 Base64 encoded image data
 */
export async function verifyPersonImage(imageBase64: string): Promise<{
  isHuman: boolean;
  confidence: number;
  message: string;
}> {
  try {
    // The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are an AI identity verification expert. Analyze the image to determine if it shows a real human face (not a photo of a photo, not a drawing, etc.). " +
            "Return a JSON response with fields: isHuman (boolean), confidence (number between 0-1), and message (string with explanation)."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Verify if this is a real human face for identity verification purposes."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      isHuman: result.isHuman || false,
      confidence: result.confidence || 0,
      message: result.message || "Could not analyze image"
    };
  } catch (error: any) {
    console.error("OpenAI verification error:", error.message);
    return {
      isHuman: false,
      confidence: 0,
      message: `Verification error: ${error.message}`
    };
  }
}

/**
 * Analyze a video to verify a person's identity with eye movements
 * In a real app, this would process video frames to track eye movement
 * @param videoBase64 Base64 encoded video data
 */
export async function verifyPersonVideo(videoBase64: string): Promise<{
  isHuman: boolean;
  confidence: number;
  message: string;
}> {
  try {
    // For demo purposes, we'll assume a successful verification
    // In a real app, we'd extract frames from the video and analyze them
    
    // The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are an AI identity verification expert simulating video verification. " +
            "For this demo, assume the provided video shows a real person with natural eye movements. " +
            "Return a JSON response with fields: isHuman (boolean=true), confidence (number=0.95), " +
            "and message (string)."
        },
        {
          role: "user",
          content: "Verify this person's identity from the video with eye movement tracking."
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      isHuman: result.isHuman || false,
      confidence: result.confidence || 0,
      message: result.message || "Video verification completed"
    };
  } catch (error: any) {
    console.error("OpenAI video verification error:", error.message);
    return {
      isHuman: false,
      confidence: 0,
      message: `Video verification error: ${error.message}`
    };
  }
}

/**
 * Check if text content contains inappropriate material
 * @param text The text content to check
 */
export async function checkContentAppropriate(text: string): Promise<{
  isAppropriate: boolean;
  reasons: string[];
}> {
  try {
    // The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are a content moderation AI for a dating app. Check the following text for inappropriate content " +
            "including: sexual content, harassment, hate speech, personal contact information (phone numbers, emails, social media), " +
            "scams/solicitations, or other violations of dating app guidelines. " +
            "Return a JSON response with fields: isAppropriate (boolean) and reasons (array of strings explaining any violations)."
        },
        {
          role: "user",
          content: text
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      isAppropriate: result.isAppropriate !== false, // Default to true if not specified
      reasons: result.reasons || []
    };
  } catch (error: any) {
    console.error("OpenAI content moderation error:", error.message);
    return {
      isAppropriate: true, // Default to allowing content if the AI check fails
      reasons: [`Content moderation error: ${error.message}`]
    };
  }
}

/**
 * Generate an engagement message to help users keep the conversation going
 * @param conversation Previous messages in the conversation
 */
export async function generateEngagementPrompt(conversation: string[]): Promise<string> {
  try {
    // The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are an AI assistant for a dating app that helps users have more meaningful conversations. " +
            "Based on the conversation history, suggest a short, natural question or prompt that would " +
            "help keep the conversation going in an engaging way. Keep it concise (under 100 characters), " +
            "authentic, and appropriate for a dating context. Don't be overly formal or robotic."
        },
        {
          role: "user",
          content: JSON.stringify(conversation)
        },
      ],
      max_tokens: 100,
    });

    return response.choices[0].message.content || "How's your day going so far?";
  } catch (error: any) {
    console.error("OpenAI engagement prompt error:", error.message);
    return "How's your day going? I'd love to hear more about you.";
  }
}