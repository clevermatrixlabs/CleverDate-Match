import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export type DeepFaceMatch =
  | { match: "confirmed" | "borderline" | "rejected"; confidence: number }
  | { match: "no_face" }
  | { match: "unconfigured" };

function dataUrlToBuffer(value: string): Buffer | null {
  if (!value) return null;
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    return comma >= 0 ? Buffer.from(value.slice(comma + 1), "base64") : null;
  }
  return null;
}

async function imageValueToBuffer(value: string): Promise<Buffer> {
  const data = dataUrlToBuffer(value);
  if (data) return data;

  if (value.startsWith("/uploads/")) {
    return fs.readFile(path.join(process.cwd(), value.slice(1)));
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    const response = await fetch(value, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Could not download profile photo (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  if (value.startsWith("/") || value.includes(path.sep)) {
    return fs.readFile(value);
  }

  throw new Error("Unsupported image format");
}

function runDeepFace(image1Base64: string, image2Base64: string): Promise<{ verified: boolean; distance: number; threshold: number }> {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || "python";
    const child = spawn(python, [path.join(process.cwd(), "main.py"), "compare"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        console.error("[DeepFace] process failed:", stderr.slice(-2000));
        return reject(new Error("DeepFace comparison failed"));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        console.error("[DeepFace] invalid process output:", stdout.slice(-1000), stderr.slice(-1000));
        reject(new Error("DeepFace returned invalid output"));
      }
    });
    child.stdin.end(JSON.stringify({ image1Base64, image2Base64 }));
  });
}

async function comparePair(selfie: string, photo: string): Promise<{ verified: boolean; confidence: number }> {
  const [selfieBuffer, photoBuffer] = await Promise.all([
    imageValueToBuffer(selfie),
    imageValueToBuffer(photo),
  ]);
  return runDeepFace(selfieBuffer.toString("base64"), photoBuffer.toString("base64")).then((result) => ({
    verified: Boolean(result.verified),
    // ArcFace returns cosine distance. Invert it for an intuitive 0–1 match score.
    confidence: Math.max(0, Math.min(1, 1 - Number(result.distance))),
  }));
}

export async function compareSelfieToPhotos(
  selfieBase64: string,
  photoValues: string[],
): Promise<DeepFaceMatch> {
  if (!selfieBase64) return { match: "no_face" };
  const photos = photoValues.filter(Boolean);
  if (!photos.length) return { match: "borderline", confidence: 0 };

  let bestConfidence = 0;
  let verifiedMatch = false;
  let compared = false;
  for (const photo of photos) {
    try {
      const result = await comparePair(selfieBase64, photo);
      compared = true;
      bestConfidence = Math.max(bestConfidence, result.confidence);
      if (result.verified) {
        verifiedMatch = true;
        break;
      }
    } catch (error: any) {
      console.warn("[DeepFace] photo comparison skipped:", error?.message || error);
    }
  }

  if (!compared) return { match: "no_face" };
  if (verifiedMatch || bestConfidence >= 0.65) return { match: "confirmed", confidence: bestConfidence };
  if (bestConfidence >= 0.45) return { match: "borderline", confidence: bestConfidence };
  return { match: "rejected", confidence: bestConfidence };
}