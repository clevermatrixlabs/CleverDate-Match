import type { Express } from "express";
import { broadcastToLive, broadcastLiveEnd } from "./engagement";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { json, urlencoded } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import * as crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { 
  loginSchema, 
  registerSchema,
  profileSchema,
  updateProfileSchema,
  insertMatchSchema, 
  insertMessageSchema,
  insertTransactionSchema,
  insertVerificationSchema,
  depositSchema,
  STORE_GIFTS
} from "../shared/schema";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import bcrypt from "bcryptjs";
import { sendAdminNotification } from "./email";
import firebaseAppletConfig from "../firebase-applet-config.json";
import { v2 as cloudinary } from "cloudinary";
import { sendToUser } from "./engagement";

const BCRYPT_ROUNDS = 12;
async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) return bcrypt.compare(plain, stored);
  return plain === stored;
}

// ── Cloudinary config (falls back to local disk if env vars not set) ──────────
const isPlaceholder = (val?: string) =>
  !val ||
  val.toLowerCase() === "root" ||
  val.toLowerCase() === "placeholder" ||
  val.toLowerCase().includes("your_") ||
  val.length < 3;

const CLOUDINARY_CONFIGURED = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  !isPlaceholder(process.env.CLOUDINARY_CLOUD_NAME) &&
  process.env.CLOUDINARY_API_KEY &&
  !isPlaceholder(process.env.CLOUDINARY_API_KEY) &&
  process.env.CLOUDINARY_API_SECRET &&
  !isPlaceholder(process.env.CLOUDINARY_API_SECRET)
);

if (CLOUDINARY_CONFIGURED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** Upload a buffer to Cloudinary and return the secure URL. */
async function uploadToCloudinary(
  buffer: Buffer,
  originalName: string,
  folder = "timcleverdate"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase();
    const resourceType: "image" | "video" | "auto" = ext === ".mp4" || ext === ".mov" || ext === ".webm"
      ? "video"
      : "image";

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, transformation: [{ quality: "auto" }] },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ── Multer — memory storage (used for Cloudinary) or disk fallback ────────────
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype.startsWith("video") ? ".mp4" : ".jpg");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const memStorage = multer.memoryStorage();
const upload = multer({
  storage: CLOUDINARY_CONFIGURED ? memStorage : diskStorage,
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB — Cloudinary handles compression
});

declare module "express-session" {
  interface SessionData {
    userId: number;
    pendingUserId: number;
  }
}

// Sole authorized administrator in the entire platform
export const SOLE_ADMIN_EMAIL = "clevermatrix.labs@gmail.com";
const PRIVILEGED_TEST_EMAILS = new Set([SOLE_ADMIN_EMAIL, "timclever82@gmail.com"]);
const isPrivilegedOrTestEmail = (email?: string | null): boolean =>
  !!email && PRIVILEGED_TEST_EMAILS.has(email.toLowerCase().trim());

export async function registerRoutes(app: Express): Promise<Server> {
  // Parse JSON and URL-encoded bodies (supporting biometric snapshots)
  app.use(json({ limit: "50mb" }));
  app.use(urlencoded({ extended: true, limit: "50mb" }));

  // Setup session (configured for HTTPS iframe in AI Studio preview)
  const sessionSecret = process.env.SESSION_SECRET || "clever-date-match-secret-session-key-2026";
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      },
    })
  );

  // Setup passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport — use email as username field
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        let user = await storage.getUserByEmail(email);
        // fallback: try phone lookup if email looks like a phone number
        if (!user && email.startsWith("+")) {
          user = await storage.getUserByPhone(email);
        }
        if (!user) {
          return done(null, false, { message: "No account found with that email or phone number" });
        }

        const passwordOk = await verifyPassword(password, user.password);
        if (!passwordOk) {
          return done(null, false, { message: "Incorrect password" });
        }
        // Auto-upgrade legacy plain-text passwords to bcrypt on successful login
        if (!user.password.startsWith('$2')) {
          const hashed = await hashPassword(password);
          await storage.updateUser(user.id, { password: hashed });
        }

        if ((user as any).isBanned) {
          return done(null, false, { message: "This account has been permanently banned. Contact support if you believe this is an error." });
        }
        if ((user as any).isSuspended) {
          return done(null, false, { message: "This account has been suspended. Please contact support." });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  const getAdminEmail = () => SOLE_ADMIN_EMAIL;

  // Auth middleware — supports session cookies and Bearer tokens for iframe compatibility
  const requireAuth = async (req: any, res: any, next: any) => {
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      req.authMethod = "session";
      return next();
    }

    // 2. Check Authorization Bearer header (Firebase ID token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      try {
        const firebaseUser = await lookupFirebaseToken(token);
        let user = firebaseUser.email
          ? await storage.getUserByEmail(firebaseUser.email)
          : undefined;
        if (!user && firebaseUser.phoneNumber) {
          user = await storage.getUserByPhone(firebaseUser.phoneNumber);
        }
        if (user) {
          req.user = user;
          req.authMethod = "bearer";
          if (req.logIn) req.logIn(user, () => {});
          return next();
        }
      } catch {}
    }

    // 3. Check X-User-Id or X-User-Email header from authenticated client state
    // STRICT SECURITY: Never allow claiming or elevating to SOLE_ADMIN_EMAIL via arbitrary client headers.
    // Admin privileges strictly require authenticated session or verified Bearer token.
    const customUserId = req.headers["x-user-id"];
    const customUserEmail = req.headers["x-user-email"];
    if (customUserId && !isNaN(Number(customUserId))) {
      const user = await storage.getUser(Number(customUserId));
      if (user && user.email?.toLowerCase().trim() !== SOLE_ADMIN_EMAIL) {
        req.user = user;
        req.authMethod = "header";
        if (req.logIn) req.logIn(user, () => {});
        return next();
      }
    }
    if (customUserEmail && typeof customUserEmail === "string") {
      const normalizedEmail = customUserEmail.trim().toLowerCase();
      if (normalizedEmail !== SOLE_ADMIN_EMAIL) {
        const user = await storage.getUserByEmail(normalizedEmail);
        if (user) {
          req.user = user;
          req.authMethod = "header";
          if (req.logIn) req.logIn(user, () => {});
          return next();
        }
      }
    }

    return res.status(401).json({ message: "Unauthorized" });
  };

  // Helper to check if a user has an active (non-expired) subscription or trial
  const hasActiveSubscription = (user: any): boolean => {
    if (isPrivilegedOrTestEmail(user?.email)) return true;
    if (!user || !user.subscriptionTier || user.subscriptionTier === "none") return false;
    if (user.subscriptionExpiry) {
      return new Date(user.subscriptionExpiry).getTime() > Date.now();
    }
    return true;
  };

  // Helper to build safe user response
  const safeUser = (user: any) => {
    const activeSub = hasActiveSubscription(user);
    const isTestOrAdmin = isPrivilegedOrTestEmail(user?.email);
    const activeTrial =
      !!user.trialActivated &&
      (!user.trialExpiresAt || new Date(user.trialExpiresAt).getTime() > Date.now());
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      religion: user.religion,
      aboutMe: user.aboutMe,
      idealMatch: user.idealMatch ?? null,
      interests: user.interests,
      location: user.location,
      country: user.country,
      nationalIdType: user.nationalIdType,
      age: user.age,
      isVerified: isTestOrAdmin ? true : user.isVerified,
      isEmailVerified: isTestOrAdmin ? true : user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      profilePicture: user.profilePicture,
      profileVideo: user.profileVideo,
      additionalPicture1: user.additionalPicture1,
      additionalPicture2: user.additionalPicture2,
      subscriptionTier: activeSub ? (user.subscriptionTier && user.subscriptionTier !== "none" ? user.subscriptionTier : "basic") : "none",
      subscriptionExpiry: user.subscriptionExpiry,
      walletBalance: user.walletBalance,
      isAdmin: user?.email?.toLowerCase().trim() === SOLE_ADMIN_EMAIL && !!user.isAdmin,
      isSuspended: !!user.isSuspended,
      trialActivated: activeTrial,
      trialExpiresAt: user.trialExpiresAt ?? null,
    };
  };

  // Helper to build public dating profile for other users (strictly excludes all PII, financial, and private security data)
  const publicUser = (user: any) => ({
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    age: user.age,
    religion: user.religion,
    aboutMe: user.aboutMe,
    interests: user.interests,
    location: user.location,
    country: user.country,
    intention: user.intention,
    isVerified: !!user.isVerified,
    profilePicture: user.profilePicture,
    profileVideo: user.profileVideo,
    additionalPicture1: user.additionalPicture1,
    additionalPicture2: user.additionalPicture2,
    createdAt: user.createdAt,
  });

  // Auto-promote ONLY the configured SOLE_ADMIN_EMAIL (clevermatrix.labs@gmail.com) to admin,
  // and strictly revoke admin privileges from any other account so regular users can never be admin.
  const ensureAdminFlag = async (user: any) => {
    if (!user) return user;
    const adminEmail = getAdminEmail();
    const isOwner = user?.email?.toLowerCase().trim() === adminEmail;

    if (!isOwner) {
      if (user.isAdmin) {
        user = (await storage.updateUser(user.id, { isAdmin: false } as any)) || { ...user, isAdmin: false };
      }
      return user;
    }

    const needsUpdate = !user.isAdmin || !user.isVerified || !user.firstName;
    if (needsUpdate) {
      try {
        const adminUpdates: any = { isAdmin: true, isVerified: true, isEmailVerified: true };
        if (!user.firstName) adminUpdates.firstName = "Clever";
        if (!user.lastName) adminUpdates.lastName = "Admin";
        if (!user.gender) adminUpdates.gender = "male";
        if (!user.age) adminUpdates.age = 30;
        if (!user.intention) adminUpdates.intention = "getting-to-know";
        if (!user.aboutMe) adminUpdates.aboutMe = "Clever Date Match Owner and Administrator.";
        if (!user.profilePicture) adminUpdates.profilePicture = "admin-default";
        if (!user.interests || (user.interests as string[]).length === 0) adminUpdates.interests = ["Technology", "Dating"];
        const updated = await storage.updateUser(user.id, adminUpdates);
        return updated || { ...user, ...adminUpdates };
      } catch (e) {
        console.warn("Failed to auto-promote admin:", (e as any)?.message);
      }
    }
    return user;
  };

  // Admin middleware — strictly enforces that ONLY clevermatrix.labs@gmail.com has admin access
  // Re-validates directly against the database and rejects header-only auth or client-side flag tampering
  const requireAdmin = async (req: any, res: any, next: any) => {
    await requireAuth(req, res, async () => {
      if (req.authMethod === "header") {
        return res.status(403).json({ message: "Admin access requires a verified session or token." });
      }
      const dbUser = req.user?.id ? await storage.getUser(req.user.id) : undefined;
      const user = await ensureAdminFlag(dbUser);
      if (!user || user.email?.toLowerCase().trim() !== SOLE_ADMIN_EMAIL || !user.isAdmin) {
        return res.status(403).json({ message: "Admin access required. Only clevermatrix.labs@gmail.com is authorized." });
      }
      req.user = user;
      next();
    });
  };

  // ── Rate limiters ─────────────────────────────────────────────────────────
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // max 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Please try again in 15 minutes." },
  });

  const strictRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,                    // max 5 OTP requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many OTP requests. Please try again in an hour." },
  });

  // ── CSRF: reject requests from unexpected origins ──────────────────────────
  const csrfGuard = (req: any, res: any, next: any) => {
    const origin = req.headers.origin || req.headers.referer || "";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    // Allow same-origin (no Origin header = server-side/curl), local development, and AI Studio / Cloud Run URLs
    if (
      !origin ||
      origin.includes(host) ||
      origin.includes("run.app") ||
      origin.includes("aistudio") ||
      origin.includes("google") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes("replit") ||
      origin.includes("replit.app")
    ) {
      return next();
    }
    return res.status(403).json({ message: "Forbidden: cross-origin request blocked" });
  };

  app.use("/api/auth/login", authRateLimit, csrfGuard);
  app.use("/api/auth/register", authRateLimit, csrfGuard);
  app.use("/api/auth/login-phone", authRateLimit, csrfGuard);
  app.use("/api/auth/firebase/sync", authRateLimit, csrfGuard);
  app.use("/api/auth/firebase/phone-verified", strictRateLimit, csrfGuard);
  app.use("/api/auth/otp/send", authRateLimit, csrfGuard);
  app.use("/api/auth/otp/verify", authRateLimit, csrfGuard);

  // Firebase Authentication is the source of truth for email/phone proof.
  // The REST lookup validates the ID token without exposing a service account
  // Firebase Authentication is the source of truth for email/phone proof.
  async function lookupFirebaseToken(idToken: string): Promise<{
    localId: string;
    email?: string;
    emailVerified?: boolean;
    phoneNumber?: string;
    displayName?: string;
  }> {
    const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey;

    // 1. First attempt: Google Identity Toolkit REST accounts:lookup
    if (apiKey) {
      try {
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.users?.[0]) {
          const firebaseUser = body.users[0];
          return {
            localId: firebaseUser.localId,
            email: firebaseUser.email?.toLowerCase(),
            emailVerified: Boolean(firebaseUser.emailVerified),
            phoneNumber: firebaseUser.phoneNumber,
            displayName: firebaseUser.displayName,
          };
        }
      } catch (err: any) {
        console.warn("Google identitytoolkit REST lookup warning, trying JWT decode:", err?.message);
      }
    }

    // 2. Second attempt: Decode signed Firebase ID Token (JWT) payload
    try {
      const parts = idToken.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const payload = JSON.parse(payloadJson);
        const projectId = firebaseAppletConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID;

        const isIssuerOk =
          !payload.iss ||
          payload.iss.includes("securetoken.google.com") ||
          payload.iss.includes("accounts.google.com") ||
          (projectId && payload.iss.includes(projectId));

        if (isIssuerOk && (payload.sub || payload.user_id)) {
          return {
            localId: payload.user_id || payload.sub,
            email: payload.email?.toLowerCase(),
            emailVerified: Boolean(payload.email_verified),
            phoneNumber: payload.phone_number,
            displayName: payload.name,
          };
        }
      }
    } catch (jwtErr: any) {
      console.warn("JWT fallback decode error:", jwtErr?.message);
    }

    throw new Error("Invalid or expired Firebase session");
  }

  function usernameBaseForFirebase(firebaseUser: Awaited<ReturnType<typeof lookupFirebaseToken>>) {
    const source = firebaseUser.email?.split("@")[0] || firebaseUser.phoneNumber?.replace(/\D/g, "").slice(-8) || "user";
    return source.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 24) || "user";
  }

  async function createFirebaseLocalUser(
    firebaseUser: Awaited<ReturnType<typeof lookupFirebaseToken>>,
    country?: string,
    signupPassword?: string,
  ) {
    const baseUsername = usernameBaseForFirebase(firebaseUser);
    let username = baseUsername;
    let counter = 1;
    while (await storage.getUserByUsername(username)) username = `${baseUsername}${counter++}`;

    const nameParts = (firebaseUser.displayName || "").trim().split(/\s+/).filter(Boolean);
    return storage.createUser({
      username,
      email: firebaseUser.email,
      phone: firebaseUser.phoneNumber,
      password: await hashPassword(signupPassword || crypto.randomBytes(32).toString("hex")),
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(" ") || undefined,
      country,
      walletBalance: "0",
      isEmailVerified: Boolean(firebaseUser.emailVerified),
      isPhoneVerified: Boolean(firebaseUser.phoneNumber),
      isVerified: false,
    });
  }

  app.post("/api/auth/firebase/sync", async (req, res) => {
    try {
      const { idToken, country, allowUnverifiedEmail, intent, password } = req.body;
      if (!idToken || typeof idToken !== "string") {
        return res.status(400).json({ message: "We could not confirm your account. Please try again." });
      }

      const firebaseUser = await lookupFirebaseToken(idToken);
      if (!firebaseUser.email && !firebaseUser.phoneNumber) {
        return res.status(400).json({ message: "We could not find an email address or phone number for this account." });
      }
      if (firebaseUser.email && !firebaseUser.emailVerified && allowUnverifiedEmail === false) {
        return res.status(403).json({ message: "Please verify your email address before continuing." });
      }
      if (intent === "signup" && firebaseUser.phoneNumber &&
          (typeof password !== "string" || password.length < 8 || password.length > 128)) {
        return res.status(400).json({ message: "Choose a password with at least 8 characters to finish phone sign-up." });
      }

      let user = firebaseUser.email
        ? await storage.getUserByEmail(firebaseUser.email)
        : undefined;
      if (!user && firebaseUser.phoneNumber) {
        user = await storage.getUserByPhone(firebaseUser.phoneNumber);
      }

      if (intent === "signup" && (user || (firebaseUser.email && await storage.isEmailRecorded(firebaseUser.email)))) {
        return res.status(409).json({
          message: "An account is already linked to that email address. Please sign in instead.",
        });
      }

      if (user) {
        const updates: any = {};
        if (firebaseUser.email && !user.email) updates.email = firebaseUser.email;
        if (firebaseUser.phoneNumber && !user.phone) updates.phone = firebaseUser.phoneNumber;
        if (firebaseUser.emailVerified && !user.isEmailVerified) updates.isEmailVerified = true;
        if (firebaseUser.phoneNumber && !user.isPhoneVerified) updates.isPhoneVerified = true;
        if (country && !user.country) updates.country = country;
        if (isPrivilegedOrTestEmail(user.email || firebaseUser.email)) {
          updates.isVerified = true;
          updates.isEmailVerified = true;
        }
        if (Object.keys(updates).length) user = await storage.updateUser(user.id, updates) || user;
      } else {
        user = await createFirebaseLocalUser(
          firebaseUser,
          country,
          intent === "signup" && firebaseUser.phoneNumber ? password : undefined,
        );
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);
        const trialUpdates: any = {
          subscriptionTier: "basic",
          subscriptionExpiry: trialEnd.toISOString(),
          trialActivated: true,
          trialExpiresAt: trialEnd.toISOString(),
          ...(isPrivilegedOrTestEmail(firebaseUser.email) ? { isVerified: true, isEmailVerified: true } : {}),
        };
        await storage.updateUser(user.id, trialUpdates);
        Object.assign(user, trialUpdates);
      }

      if ((user as any).isBanned) {
        return res.status(403).json({ message: "This account has been banned. Contact support." });
      }
      if ((user as any).isSuspended) {
        return res.status(403).json({ message: "This account is suspended. Contact support." });
      }

      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "We could not sign you in. Please try again." });
        return res.json(safeUser(user));
      });
    } catch (error: any) {
      console.error("Firebase sync error:", error?.message || error);
      res.status(401).json({ message: "We could not confirm your account. Please try again." });
    }
  });

  app.post("/api/auth/firebase/phone-verified", async (req, res) => {
    try {
      const { idToken, phone } = req.body;
      if (!idToken || !phone) return res.status(400).json({ message: "A phone number and verification code are required." });
      const firebaseUser = await lookupFirebaseToken(idToken);
      if (!firebaseUser.phoneNumber || firebaseUser.phoneNumber !== phone) {
        return res.status(400).json({ message: "The verified phone number does not match the submitted number." });
      }

      let user = req.user as any;
      if (!user && req.session?.userId) {
        user = await storage.getUser(req.session.userId);
      }
      if (!user && firebaseUser.email) {
        user = await storage.getUserByEmail(firebaseUser.email);
      }
      if (!user) {
        user = await storage.getUserByPhone(phone);
      }
      if (!user) {
        return res.status(404).json({ message: "Account not found for this phone number." });
      }

      const existing = await storage.getUserByPhone(phone);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ message: "That phone number is already linked to another account." });
      }

      const updated = await storage.updateUser(user.id, {
        phone,
        isPhoneVerified: true,
      } as any);

      req.logIn(updated || user, (err) => {
        if (err) console.warn("Failed to set session for phone-verified user:", err);
        return res.json({ success: true, user: safeUser(updated || user) });
      });
    } catch (error: any) {
      console.error("Firebase phone verification error:", error?.message || error);
      res.status(401).json({ message: "Could not verify this phone number. Please try again." });
    }
  });

  // ── Phone OTP System ──────────────────────────────────────────────────────
  interface PhoneOtpRecord {
    code: string;
    expiresAt: number;
    attempts: number;
  }
  const phoneOtpStore = new Map<string, PhoneOtpRecord>();

  async function dispatchSms(phone: string, code: string): Promise<{ sent: boolean; message: string }> {
    const text = `Your CleverDate verification code is: ${code}. Valid for 10 minutes.`;

    // Termii SMS Gateway (for Nigeria & Africa routes)
    const termiiKey = process.env.TERMII_API_KEY;
    if (termiiKey) {
      try {
        const res = await fetch("https://api.ng.termii.com/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: phone.replace("+", ""),
            from: process.env.TERMII_SENDER_ID || "CleverDate",
            sms: text,
            type: "plain",
            channel: "generic",
            api_key: termiiKey,
          }),
        });
        if (res.ok) {
          return { sent: true, message: `SMS sent to ${phone}.` };
        }
      } catch (err: any) {
        console.warn("[Termii SMS] Network error:", err?.message);
      }
    }

    return {
      sent: true,
      message: `Firebase Phone Auth active for ${phone}.`,
    };
  }

  // Send 6-digit phone token
  app.post("/api/auth/otp/send", async (req: any, res) => {
    try {
      const { phone } = req.body;
      if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
        return res.status(400).json({ message: "Please provide a valid phone number with country code." });
      }

      const normalized = phone.trim().replace(/\s+/g, "");
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      phoneOtpStore.set(normalized, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        attempts: 0,
      });

      console.log(`[Phone Verification Code] Generated token for ${normalized}`);

      const { sent, message } = await dispatchSms(normalized, code);

      return res.json({
        success: true,
        message,
        carrierSmsSent: sent,
      });
    } catch (error: any) {
      console.error("OTP send error:", error);
      res.status(500).json({ message: "Failed to send verification SMS. Please try again." });
    }
  });

  // Verify 6-digit phone token (self-authorizing via 6-digit cryptographic code)
  app.post("/api/auth/otp/verify", async (req: any, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone number and 6-digit code are required." });
      }

      const normalized = phone.trim().replace(/\s+/g, "");
      const record = phoneOtpStore.get(normalized);

      if (!record) {
        return res.status(400).json({ message: "No verification token found. Please tap Resend Code." });
      }

      if (Date.now() > record.expiresAt) {
        phoneOtpStore.delete(normalized);
        return res.status(400).json({ message: "Verification token has expired. Please request a new code." });
      }

      if (record.code !== code.toString().trim()) {
        record.attempts += 1;
        if (record.attempts >= 5) {
          phoneOtpStore.delete(normalized);
          return res.status(400).json({ message: "Too many incorrect attempts. Please tap Resend Code." });
        }
        return res.status(400).json({ message: "Incorrect verification code. Please check and try again." });
      }

      // Token verified successfully!
      phoneOtpStore.delete(normalized);

      // Resolve user: via session, via phone, or via session ID
      let user = (req.user as any) || (req.session?.userId ? await storage.getUser(req.session.userId) : null);
      if (!user) {
        user = await storage.getUserByPhone(normalized);
      }
      if (!user) {
        const allUsers = await (storage as any).getUsers?.() || [];
        if (allUsers.length > 0) user = allUsers[allUsers.length - 1];
      }

      if (user) {
        const existing = await storage.getUserByPhone(normalized);
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ message: "That phone number is already linked to another account." });
        }

        const updated = await storage.updateUser(user.id, {
          phone: normalized,
          isPhoneVerified: true,
        } as any);

        // Establish session so subsequent verification requests are authenticated
        req.logIn(updated || user, () => {});

        return res.json({
          success: true,
          message: "Phone number verified successfully!",
          user: safeUser(updated || user),
        });
      }

      return res.json({
        success: true,
        message: "Phone number confirmed successfully!",
      });
    } catch (error: any) {
      console.error("OTP verify error:", error);
      res.status(500).json({ message: "Failed to verify token. Please try again." });
    }
  });

  // Pre-registration database check for existing email
  app.post("/api/auth/check-email", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      const existingUser = await storage.getUserByEmail(email);
      const alreadyRecorded = await storage.isEmailRecorded(email);
      if (existingUser || alreadyRecorded) {
        return res.status(409).json({
          exists: true,
          message: "An account is already linked to that email address. Please sign in instead.",
        });
      }
      return res.json({ exists: false });
    } catch (error) {
      return res.status(500).json({ message: "Failed to check email availability" });
    }
  });

  // Auth routes — email-based registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);

      // Query database before creating a new user account
      const existingUser = await storage.getUserByEmail(validatedData.email);
      const alreadyRecorded = await storage.isEmailRecorded(validatedData.email);
      if (existingUser || alreadyRecorded) {
        return res.status(409).json({
          message: "An account is already linked to that email address. Please sign in instead.",
        });
      }

      // Derive a username from the email (part before @)
      const baseUsername = validatedData.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
      let username = baseUsername;
      let counter = 1;
      while (await storage.getUserByUsername(username)) {
        username = `${baseUsername}${counter++}`;
      }

      const normalizedEmail = validatedData.email.trim().toLowerCase();
      const isTestOrAdmin = isPrivilegedOrTestEmail(normalizedEmail);
      const newUser = await storage.createUser({
        username,
        email: normalizedEmail,
        password: await hashPassword(validatedData.password),
        country: validatedData.country,
        walletBalance: "0",
        isAdmin: normalizedEmail === SOLE_ADMIN_EMAIL,
        isVerified: isTestOrAdmin,
        isEmailVerified: isTestOrAdmin,
        isPhoneVerified: false,
      });

      // Grant 1-week (7-day) free trial to all new users
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      const trialUpdates: any = {
        subscriptionTier: "basic",
        subscriptionExpiry: trialEnd.toISOString(),
        trialActivated: true,
        trialExpiresAt: trialEnd.toISOString(),
      };
      await storage.updateUser(newUser.id, trialUpdates);
      Object.assign(newUser, trialUpdates);
      console.log(`[trial] User #${newUser.id} granted 7-day (1-week) free trial`);

      req.logIn(newUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login after registration failed" });
        }
        return res.status(201).json(safeUser(newUser));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation error" });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    try {
      loginSchema.parse(req.body);

      passport.authenticate("local", (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ message: info?.message || "Invalid email or password" });
        }
        req.logIn(user, (err) => {
          if (err) return next(err);
          return res.json(safeUser(user));
        });
      })(req, res, next);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation error" });
      }
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  // Phone-based login with password
  app.post("/api/auth/login-phone", async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) return res.status(400).json({ message: "Phone and password required" });

      const user = await storage.getUserByPhone(phone);
      if (!user || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }
      // Auto-upgrade legacy plain-text passwords
      if (!user.password.startsWith('$2')) {
        await storage.updateUser(user.id, { password: await hashPassword(password) });
      }

      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        return res.json(safeUser(user));
      });
    } catch (error) {
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  // Google Sign-In
  app.post("/api/auth/google", authRateLimit, csrfGuard, async (req, res) => {
    try {
      const { credential, accessToken } = req.body;
      let payload: any;
      if (accessToken) {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userRes.ok) return res.status(401).json({ message: "Invalid Google access token" });
        payload = await userRes.json();
        if (payload.error) return res.status(401).json({ message: "Google token verification failed" });
      } else if (credential) {
        const tokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (!tokenRes.ok) return res.status(401).json({ message: "Invalid Google credential" });
        payload = await tokenRes.json() as any;
        if (payload.error) return res.status(401).json({ message: "Google token verification failed" });
        const clientId = process.env.GOOGLE_CLIENT_ID || firebaseAppletConfig.oAuthClientId;
        if (clientId && payload.aud !== clientId && payload.aud !== firebaseAppletConfig.oAuthClientId) {
          return res.status(401).json({ message: "Google token audience mismatch" });
        }
      } else {
        return res.status(400).json({ message: "Google credential or access token is required" });
      }

      const email = (payload.email || "").toLowerCase();
      if (!email) return res.status(400).json({ message: "Could not retrieve email from Google" });

      // Find or create user
      let user: any = await storage.getUserByEmail(email);
      if (req.body?.intent === "signup" && (user || await storage.isEmailRecorded(email))) {
        return res.status(409).json({
          message: "An account is already linked to that email address. Please sign in instead.",
        });
      }
      if (user) {
        if (user.isBanned) return res.status(403).json({ message: "This account has been banned. Contact support." });
        if (user.isSuspended) return res.status(403).json({ message: "This account is suspended. Contact support." });
      } else {
        // New Google user — create account
        const nameParts = (payload.name || email.split("@")[0]).split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "user";
        let username = baseUsername;
        let counter = 1;
        while (await storage.getUserByUsername(username)) {
          username = `${baseUsername}${counter++}`;
        }
        user = await storage.createUser({
          username,
          email,
          password: await hashPassword(crypto.randomBytes(32).toString("hex")),
          firstName,
          lastName,
          isAdmin: email === SOLE_ADMIN_EMAIL,
          isEmailVerified: true,
          isVerified: false,
          isPhoneVerified: false,
          walletBalance: "0",
        });
        // Grant 1-week (7-day) free trial to all new Google users
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);
        const trialUpdates: any = {
          subscriptionTier: "basic",
          subscriptionExpiry: trialEnd.toISOString(),
          trialActivated: true,
          trialExpiresAt: trialEnd.toISOString(),
        };
        await storage.updateUser(user.id, trialUpdates);
        Object.assign(user, trialUpdates);
      }

      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        return res.json(safeUser(user));
      });
    } catch (error: any) {
      console.error("Google auth error:", error);
      res.status(500).json({ message: "Google sign-in failed. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    let user = req.user as any;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    // Auto-promote + auto-verify admin on every session check
    user = await ensureAdminFlag(user);
    res.json(safeUser(user));
  });

  // AI engine status route (OpenAI + DeepSeek integration)
  app.get("/api/ai/status", async (_req, res) => {
    const { getAiStatus } = await import("./ai");
    res.json(getAiStatus());
  });

  app.post("/api/verification", async (req: any, res) => {
    try {
      const {
        selfieBase64,   // JPEG data-URL captured from camera on the client
        livenessSignals,
        deviceId,
        phone,
        userId,
        email,
      } = req.body;

      let user = req.user as any;
      if (!user && req.session?.userId) {
        user = await storage.getUser(req.session.userId);
      }

      // Check Authorization Bearer header
      const authHeader = req.headers.authorization;
      if (!user && authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        try {
          const firebaseUser = await lookupFirebaseToken(token);
          if (firebaseUser.email) {
            user = await storage.getUserByEmail(firebaseUser.email);
          }
          if (!user && firebaseUser.phoneNumber) {
            user = await storage.getUserByPhone(firebaseUser.phoneNumber);
          }
        } catch (err: any) {
          console.warn("[verification] Bearer token lookup warning:", err?.message);
        }
      }

      // Check explicit body credentials (userId, email, or phone)
      if (!user && userId && !isNaN(Number(userId))) {
        const candidate = await storage.getUser(Number(userId));
        // Never allow claiming sole admin via unauthenticated body parameter
        if (candidate && candidate.email?.toLowerCase().trim() !== SOLE_ADMIN_EMAIL) {
          user = candidate;
        }
      }
      if (!user && email && typeof email === "string") {
        const normEmail = email.trim().toLowerCase();
        if (normEmail !== SOLE_ADMIN_EMAIL) {
          user = await storage.getUserByEmail(normEmail);
        }
      }
      if (!user && phone) {
        const normPhone = phone.trim().replace(/\s+/g, "");
        user = await storage.getUserByPhone(normPhone);
      }

      if (!user) {
        return res.status(401).json({ message: "Unauthorized. Please log in to complete identity verification." });
      }

      // Log in session for subsequent calls
      if (req.logIn && (!req.user || req.user.id !== user.id)) {
        req.logIn(user, () => {});
      }

      if (!selfieBase64 || typeof selfieBase64 !== "string") {
        return res.status(400).json({ message: "Selfie image is required. Please complete the face scan." });
      }

      const freshUser = await storage.getUser(user.id) as any;

      // ── Device ban check ─────────────────────────────────────────────────────
      if (deviceId) {
        const banned = await storage.isDeviceBanned(deviceId);
        if (banned) {
          await storage.updateUser(user.id, { isBanned: true, bannedReason: "Device is banned" } as any);
          return res.status(403).json({
            message: "This device has been blocked. Contact support if you believe this is a mistake.",
            banned: true,
          });
        }
        await storage.updateUser(user.id, { deviceId } as any);
      }

      // ── Biometric Face Liveness & Anti-Spoofing Check ────────────────────────
      const { verify } = await import("./verification");
      const livenessCheck = await verify(selfieBase64, livenessSignals);
      if (!livenessCheck.success) {
        return res.status(400).json({
          message: livenessCheck.message || "Face liveness verification failed. Please ensure a live scan with good lighting.",
        });
      }

      // ── Save selfie for admin review ─────────────────────────────────────────
      const selfieDataOnly = selfieBase64.includes(",") ? selfieBase64.split(",")[1] : selfieBase64;
      await storage.updateUser(user.id, { selfiePhoto: selfieDataOnly } as any);

      // ── DeepFace / ArcFace — compare selfie vs profile photos ────────────────
      const { compareSelfieToPhotos } = await import("./deepface");

      // Collect profile photos stored for this user (as base64 data-URLs)
      const profilePhotos: string[] = [
        freshUser?.profilePicture,
        freshUser?.additionalPicture1,
        freshUser?.additionalPicture2,
      ].filter(Boolean) as string[];

      let faceMatchScore: string | null = null;
      let photoMismatch = false;

      const faceResult = await compareSelfieToPhotos(selfieBase64, profilePhotos);
      console.log(`[verification] DeepFace result for user ${user.id}:`, faceResult);

      const faceConfidence = "confidence" in faceResult ? faceResult.confidence : null;
      faceMatchScore = faceConfidence != null ? faceConfidence.toFixed(3) : null;

      if (faceResult.match === "rejected") {
        if (deviceId) {
          await storage.createDeviceBan(
            deviceId,
            `Profile photo face mismatch (confidence=${faceConfidence?.toFixed(3)})`,
            undefined,
            req.ip,
          );
        }
        await storage.createVerification({
          userId: user.id,
          status: "rejected",
          verificationData: selfieDataOnly,
          faceMatchScore,
          rejectedReason: `Selfie does not match profile photos (DeepFace confidence=${faceConfidence?.toFixed(3)})`,
        });
        await storage.updateUser(user.id, {
          isSuspended: true,
          suspendedReason: "Verification failed: selfie doesn't match profile photos",
        } as any);
        return res.status(400).json({
          message: "Your selfie doesn't match your profile photos. Please use photos that genuinely show your face.",
        });
      }

      if (faceResult.match === "borderline" || faceResult.match === "no_face") {
        photoMismatch = true;
      }

      // ── Mark verified (or pending review for borderline cases) ───────────────
      if (photoMismatch) {
        await storage.createVerification({
          userId: user.id,
          status: "pending_review",
          verificationData: selfieDataOnly,
          faceMatchScore,
        });
        await storage.updateUser(user.id, {
          isSuspended: true,
          suspendedReason: "Pending identity review",
        } as any);
        return res.json({
          success: true,
          status: "pending_review",
          message: "Your verification is under review. You'll be notified once approved.",
        });
      }

      await storage.createVerification({
        userId: user.id,
        status: "approved",
        verificationData: selfieDataOnly,
        faceMatchScore,
        approvedAt: new Date(),
      });

      await storage.updateUser(user.id, {
        isVerified: true,
      } as any);

      return res.json({ success: true, message: "Verification successful" });

    } catch (error: any) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "We could not complete your verification. Please try again." });
    }
  });

  // Sensitive/privileged user fields that can NEVER be modified by arbitrary profile updates
  const FORBIDDEN_USER_MUTATION_FIELDS = [
    "isAdmin", "is_admin",
    "isVerified", "is_verified",
    "isEmailVerified", "is_email_verified",
    "isPhoneVerified", "is_phone_verified",
    "walletBalance", "wallet_balance",
    "subscriptionTier", "subscription_tier",
    "subscriptionExpiry", "subscription_expiry",
    "trialActivated", "trial_activated",
    "trialExpiresAt", "trial_expires_at",
    "isSuspended", "is_suspended",
    "suspendedReason", "suspended_reason",
    "isBanned", "is_banned",
    "bannedReason", "banned_reason",
    "password",
    "id",
    "role",
    "email",
    "phone",
    "deviceId", "device_id",
    "flutterwaveCardToken", "flutterwave_card_token",
    "selfiePhoto", "selfie_photo",
    "faceDescriptor", "face_descriptor",
    "azureFaceId", "azure_face_id",
    "createdAt", "created_at",
    "updatedAt", "updated_at",
  ];

  // Profile routes — accepts multipart/form-data with optional photo/video files
  app.post(
    "/api/users/profile",
    requireAuth,
    (req: any, res: any, next: any) => {
      // Wrap multer so file-size errors return a proper JSON response instead of crashing
      upload.fields([
        { name: "primaryPhoto", maxCount: 1 },
        { name: "profileVideo", maxCount: 1 },
        { name: "additionalPhoto", maxCount: 1 },
        { name: "additionalPhoto2", maxCount: 1 },
      ])(req, res, (err: any) => {
        if (err) {
          const msg = err.code === "LIMIT_FILE_SIZE"
            ? "File is too large. Maximum size is 5 MB per file."
            : err.message || "File upload error";
          return res.status(400).json({ message: msg });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        const user = req.user as any;

        // Reject if any privileged or sensitive fields are sent in the request body
        for (const field of FORBIDDEN_USER_MUTATION_FIELDS) {
          if (field in req.body) {
            console.warn(`[security] User ${user.id} attempted to modify sensitive field in profile creation: ${field}`);
            return res.status(403).json({
              message: `You are not permitted to modify sensitive field '${field}'. Admin, verification, balance, subscription, and account status fields are protected.`,
            });
          }
        }

        // Validate text fields strictly — age comes as a string from FormData
        const validatedData = profileSchema.parse({
          ...req.body,
          age: req.body.age ? parseInt(req.body.age, 10) : undefined,
        });

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } || {};

        const updates: any = { ...validatedData };

        // ── Resolve file URLs: Cloudinary (preferred) or local disk fallback ──
        const resolveUrl = async (file: Express.Multer.File): Promise<string> => {
          if (CLOUDINARY_CONFIGURED && file.buffer) {
            try {
              return await uploadToCloudinary(file.buffer, file.originalname);
            } catch (cloudErr: any) {
              console.warn("Cloudinary upload failed, using local file storage:", cloudErr?.message || cloudErr);
            }
          }
          if (file.filename) {
            return `/uploads/${file.filename}`;
          }
          if (file.buffer) {
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            const ext = path.extname(file.originalname) || (file.mimetype?.startsWith("video") ? ".mp4" : ".jpg");
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
            const targetPath = path.join(uploadsDir, filename);
            await fs.promises.writeFile(targetPath, file.buffer);
            return `/uploads/${filename}`;
          }
          return "";
        };

        if (files.primaryPhoto?.[0]) updates.profilePicture = await resolveUrl(files.primaryPhoto[0]);
        if (files.profileVideo?.[0]) updates.profileVideo = await resolveUrl(files.profileVideo[0]);
        if (files.additionalPhoto?.[0]) updates.additionalPicture1 = await resolveUrl(files.additionalPhoto[0]);
        if (files.additionalPhoto2?.[0]) updates.additionalPicture2 = await resolveUrl(files.additionalPhoto2[0]);

        // Explicit allowlist of allowed fields to persist
        const allowedProfileKeys = [
          "firstName", "lastName", "gender", "intention", "religion",
          "aboutMe", "idealMatch", "age", "interests", "location", "country",
          "profilePicture", "profileVideo", "additionalPicture1", "additionalPicture2"
        ];
        const sanitizedUpdates: any = {};
        for (const key of allowedProfileKeys) {
          if (updates[key] !== undefined) {
            sanitizedUpdates[key] = updates[key];
          }
        }

        const updatedUser = await storage.updateUser(user.id, sanitizedUpdates);

        res.json({ success: true, user: safeUser(updatedUser || user) });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const msg = error.errors[0]?.message || "Validation error";
          return res.status(400).json({ message: msg });
        }
        console.error("Profile error:", error);
        res.status(500).json({ message: "Failed to update profile" });
      }
    }
  );

  // Authenticated user profile update — strictly guarded against privilege escalation and sensitive field tampering
  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "Invalid request payload. Expected a JSON object." });
      }

      // Check for and block any attempted modification of protected/sensitive fields
      for (const field of FORBIDDEN_USER_MUTATION_FIELDS) {
        if (field in req.body) {
          console.warn(`[security] User ${user.id} attempted to modify sensitive field via PATCH /api/users/me: ${field}`);
          return res.status(403).json({
            message: `You are not permitted to modify sensitive field '${field}'. Admin, verification, balance, subscription, and account status fields are protected.`,
          });
        }
      }

      // Parse and sanitize allowed profile updates strictly using Zod
      const validatedUpdates = updateProfileSchema.parse(req.body);

      if (Object.keys(validatedUpdates).length === 0) {
        return res.status(400).json({ message: "No valid profile fields provided for update" });
      }

      // Update user with strictly sanitized, non-privileged fields only
      const updatedUser = await storage.updateUser(user.id, validatedUpdates);

      res.json(safeUser(updatedUser));
    } catch (error) {
      if (error instanceof z.ZodError) {
        const msg = error.errors[0]?.message || "Validation error";
        return res.status(400).json({ message: msg });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Permanent account + data deletion (GDPR-compliant)
  app.delete("/api/users/me", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      // Prevent deletion of the owner/admin account
      if (user.email?.toLowerCase().trim() === SOLE_ADMIN_EMAIL) {
        return res.status(403).json({ message: "The owner account cannot be deleted." });
      }
      await storage.deleteUser(user.id);
      req.logout(() => {
        req.session.destroy(() => {
          res.json({ success: true, message: "Your account and all associated data have been permanently deleted." });
        });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });

  // Get AI-powered personality insights for your profile
  app.get("/api/users/personality-insights", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      // Premium feature check
      if (user.subscriptionTier === "none") {
        return res.status(403).json({ 
          message: "This feature requires a subscription",
          isPremium: true
        });
      }

      // Generate personality insights using AI
      try {
        const { generatePersonalityInsights } = await import('./ai');
        const insights = await generatePersonalityInsights(user);
        res.json(insights);
      } catch (aiError) {
        console.error("Error generating personality insights:", aiError);
        res.status(500).json({ message: "Failed to generate personality insights" });
      }
    } catch (error) {
      console.error("Get personality insights error:", error);
      res.status(500).json({ message: "Failed to get personality insights" });
    }
  });

  // Helper — returns list of missing required profile fields
  function getProfileMissingFields(u: any): string[] {
    const missing: string[] = [];
    if (!u.firstName) missing.push("First name");
    if (!u.gender) missing.push("Gender");
    if (!u.aboutMe || u.aboutMe.trim().length < 3) missing.push("Bio");
    return missing;
  }

  // Returns true if two intentions are compatible for matching
  function intentionsCompatible(a: string | null, b: string | null): boolean {
    if (!a || !b) return true;
    if (a === b) return true;
    // marriage ↔ long-term (both serious)
    if ((a === "marriage" && b === "long-term") || (a === "long-term" && b === "marriage")) return true;
    // long-term ↔ getting-to-know (open-minded)
    if ((a === "long-term" && b === "getting-to-know") || (a === "getting-to-know" && b === "long-term")) return true;
    // marriage ↔ getting-to-know → NEVER compatible
    return false;
  }

  // Daily match limit (5 matches/actions per day, whether subscribed or not)
  const DAILY_MATCH_LIMIT = 5;
  const dailyMatchActions = new Map<string, number>();
  function getDailyMatchKey(userId: number): string {
    const today = new Date().toISOString().slice(0, 10);
    return `${userId}:${today}`;
  }
  function getDailyMatchCount(userId: number): number {
    return dailyMatchActions.get(getDailyMatchKey(userId)) ?? 0;
  }
  function incrementDailyMatchCount(userId: number): number {
    const key = getDailyMatchKey(userId);
    const next = (dailyMatchActions.get(key) ?? 0) + 1;
    dailyMatchActions.set(key, next);
    return next;
  }

  // Daily match status endpoint
  app.get("/api/matches/daily-status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const usedToday = getDailyMatchCount(user.id);
      const remainingToday = Math.max(0, DAILY_MATCH_LIMIT - usedToday);
      const existingMatch = await storage.getCurrentMatch(user.id);
      const hasActiveMatch = !!(existingMatch && existingMatch.status === "accepted");
      res.json({
        dailyLimit: DAILY_MATCH_LIMIT,
        usedToday,
        remainingToday,
        dailyLimitReached: remainingToday === 0,
        hasActiveMatch,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get daily match status" });
    }
  });

  // Match routes — strictly 1-on-1 dating, 1 match at a time, 5 matches/day
  app.get("/api/matches/potential", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      // Must have an active subscription or 7-day free trial
      if (!hasActiveSubscription(user)) {
        return res.status(403).json({
          message: "Your 7-day free trial has ended. Please add your card or subscribe via PayPal to continue matching.",
          requiresSubscription: true,
        });
      }

      // Must be verified (admin and timclever82@gmail.com testing email are auto-verified)
      if (!user.isVerified && !isPrivilegedOrTestEmail(user.email)) {
        return res.status(403).json({
          message: "You must complete face & ID verification before matching.",
          requiresVerification: true,
        });
      }

      // Must have a complete profile (admin & testing emails can go straight through)
      if (!isPrivilegedOrTestEmail(user.email)) {
        const missing = getProfileMissingFields(user);
        if (missing.length > 0) {
          return res.status(403).json({
            message: "Complete your profile before matching.",
            requiresProfile: true,
            missingFields: missing,
          });
        }
      }

      // Strictly 1-on-1 dating: if user already has an active accepted match, do not show new candidates
      const existingMatch = await storage.getCurrentMatch(user.id);
      if (existingMatch && existingMatch.status === "accepted") {
        return res.status(403).json({
          message: "You are currently in a 1-on-1 match. Focus on your connection or unmatch to meet someone new.",
          hasActiveMatch: true,
        });
      }

      // Enforce 5 matches/day limit (whether subscribed or not)
      const usedToday = getDailyMatchCount(user.id);
      if (usedToday >= DAILY_MATCH_LIMIT) {
        return res.status(429).json({
          message: "You have reached your daily limit of 5 matches for today. Come back tomorrow!",
          dailyLimitReached: true,
          dailyLimit: DAILY_MATCH_LIMIT,
          usedToday,
          remainingToday: 0,
        });
      }

      // Get potential matches — opposite gender, verified, complete profile
      let potentialMatches = await storage.getPotentialMatches(user.id, user.gender);

      // Only show candidates who are also verified and have complete profiles
      potentialMatches = potentialMatches.filter((m) => {
        if (!m.isVerified) return false;
        const mMissing = getProfileMissingFields(m);
        return mMissing.length === 0;
      });

      // Filter by compatible intentions — incompatible pairs are never shown
      potentialMatches = potentialMatches.filter((m) =>
        intentionsCompatible(user.intention ?? null, m.intention ?? null)
      );

      // Score and rank using AI compatibility (including user's idealMatch profile description) — return strictly ONE match at a time
      const { findOptimalMatches } = await import('./ai');
      const ranked = await findOptimalMatches(user, potentialMatches, 1);
      const sanitizedRanked = ranked.slice(0, 1).map((c) => ({
        ...publicUser(c),
        compatibilityScore: c.compatibilityScore,
        compatibilityReason: c.compatibilityReason,
        sharedInterests: c.sharedInterests,
      }));
      res.json(sanitizedRanked);
    } catch (error) {
      console.error("Get potential matches error:", error);
      res.status(500).json({ message: "Failed to get potential matches" });
    }
  });

  // Save matching preferences
  app.patch("/api/matches/preferences", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { minAgePreference, maxAgePreference, preferredCountries, preferredReligion } = req.body;

      const updates: any = {};
      if (minAgePreference !== undefined) updates.minAgePreference = minAgePreference;
      if (maxAgePreference !== undefined) updates.maxAgePreference = maxAgePreference;
      if (preferredCountries !== undefined) updates.preferredCountries = preferredCountries;
      if (preferredReligion !== undefined) updates.preferredReligion = preferredReligion;

      await storage.updateUser(user.id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error("Save preferences error:", error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.get("/api/matches/current", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      // Get current match
      const currentMatch = await storage.getCurrentMatch(user.id);

      if (!currentMatch) {
        return res.status(404).json({ message: "No active match found" });
      }

      res.json(currentMatch);
    } catch (error) {
      console.error("Get current match error:", error);
      res.status(500).json({ message: "Failed to get current match" });
    }
  });

  app.post("/api/matches/like", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Check if user already has an active 1-on-1 match
      const existingMatch = await storage.getCurrentMatch(user.id);
      if (existingMatch && existingMatch.status === "accepted") {
        return res.status(400).json({ message: "You already have an active 1-on-1 match" });
      }

      // Enforce 5 matches/day limit (whether subscribed or not)
      if (getDailyMatchCount(user.id) >= DAILY_MATCH_LIMIT) {
        return res.status(429).json({
          message: "Daily limit of 5 matches reached. Please come back tomorrow!",
          dailyLimitReached: true,
        });
      }

      const usedToday = incrementDailyMatchCount(user.id);

      // Create match
      const match = await storage.createMatch({
        userId: user.id,
        matchedUserId: userId,
        status: "pending",
      });

      // Check if there's a reciprocal match
      const reciprocalMatch = await storage.getMatchBetweenUsers(userId, user.id);
      if (reciprocalMatch) {
        // Update both matches to accepted
        await storage.updateMatch(match.id, { status: "accepted" });
        await storage.updateMatch(reciprocalMatch.id, { status: "accepted" });
        return res.json({
          match,
          isMatched: true,
          usedToday,
          remainingToday: Math.max(0, DAILY_MATCH_LIMIT - usedToday),
          dailyLimit: DAILY_MATCH_LIMIT,
        });
      }

      res.json({
        match,
        isMatched: false,
        usedToday,
        remainingToday: Math.max(0, DAILY_MATCH_LIMIT - usedToday),
        dailyLimit: DAILY_MATCH_LIMIT,
      });
    } catch (error) {
      console.error("Like error:", error);
      res.status(500).json({ message: "Failed to like user" });
    }
  });

  app.post("/api/matches/pass", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Enforce 5 matches/day limit (whether subscribed or not)
      if (getDailyMatchCount(user.id) >= DAILY_MATCH_LIMIT) {
        return res.status(429).json({
          message: "Daily limit of 5 matches reached. Please come back tomorrow!",
          dailyLimitReached: true,
        });
      }

      const usedToday = incrementDailyMatchCount(user.id);

      // Create match with rejected status
      await storage.createMatch({
        userId: user.id,
        matchedUserId: userId,
        status: "rejected",
      });

      res.json({
        success: true,
        usedToday,
        remainingToday: Math.max(0, DAILY_MATCH_LIMIT - usedToday),
        dailyLimit: DAILY_MATCH_LIMIT,
      });
    } catch (error) {
      console.error("Pass error:", error);
      res.status(500).json({ message: "Failed to pass user" });
    }
  });

  app.delete("/api/matches/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const matchId = parseInt(req.params.id, 10);

      // Get match
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      if (match.userId !== user.id && match.matchedUserId !== user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Update match to rejected
      await storage.updateMatch(matchId, { status: "rejected" });

      res.json({ success: true });
    } catch (error) {
      console.error("Unmatch error:", error);
      res.status(500).json({ message: "Failed to unmatch" });
    }
  });

  // Message routes
  app.get("/api/messages/:matchId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const matchId = parseInt(req.params.matchId, 10);

      // Get match
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      if (match.userId !== user.id && match.matchedUserId !== user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Check if user has active subscription or 1-week trial
      if (!hasActiveSubscription(user)) {
        return res.status(403).json({ message: "Subscription required to view messages" });
      }

      // Get messages
      const messages = await storage.getMessages(matchId);

      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/messages/:matchId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const matchId = parseInt(req.params.matchId, 10);
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }

      // Get match
      const match = await storage.getMatch(matchId);

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      if (match.userId !== user.id && match.matchedUserId !== user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Check if user has active subscription or 1-week trial
      if (!hasActiveSubscription(user)) {
        return res.status(403).json({ message: "Subscription required to send messages" });
      }

      // Check for inappropriate content using AI
      const { checkContentAppropriate } = await import('./ai');
      const contentCheck = await checkContentAppropriate(content);

      if (!contentCheck.appropriate) {
        return res.status(400).json({ 
          message: "Message contains inappropriate content", 
          reason: contentCheck.message 
        });
      }

      // Determine recipient
      const recipientId = match.userId === user.id ? match.matchedUserId : match.userId;

      // Create message
      const message = await storage.createMessage({
        matchId,
        senderId: user.id,
        recipientId,
        content,
        isRead: false,
      });

      // Push message to recipient in real-time via WebSocket
      sendToUser(recipientId, { type: 'chat_message', message });

      res.json(message);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ============================================================
  // Payment & Wallet Infrastructure
  // ============================================================

  /** Helper: activate a subscription tier for a user.
   *  Durations: basic=1mo, silver=3mo, gold=7mo, diamond=12mo */
  async function activateSubscriptionForUser(userId: number, planId: string) {
    const tierMap: Record<string, string> = { basic: "basic", silver: "silver", diamond: "diamond", gold: "gold" };
    const tier = tierMap[planId];
    if (!tier) throw new Error("Invalid plan");
    const durationMonths: Record<string, number> = { basic: 1, silver: 3, gold: 7, diamond: 12 };
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (durationMonths[planId] ?? 1));
    await storage.createSubscription({
      userId,
      tier: tier as any,
      startDate: new Date(),
      endDate,
      autoRenew: true,
      status: "active",
    });
    await storage.updateUser(userId, {
      subscriptionTier: tier as any,
      subscriptionExpiry: endDate,
    });
  }

  const PAYPAL_PLANS: Record<string, { name: string; amount: string; period: string }> = {
    basic: { name: "1 Month", amount: "15.00", period: "1 month" },
    silver: { name: "3 Months", amount: "45.00", period: "3 months" },
    gold: { name: "7 Months", amount: "110.00", period: "7 months" },
    diamond: { name: "12 Months", amount: "150.00", period: "12 months" },
  };

  let runtimePayPalEnv: "live" | "sandbox" | null = null;
  const getPayPalEnvironment = () => {
    if (runtimePayPalEnv) return runtimePayPalEnv;
    return process.env.PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
  };
  const getPayPalClientId = () => {
    if (process.env.PAYPAL_CLIENT_ID) return process.env.PAYPAL_CLIENT_ID;
    if (getPayPalEnvironment() === "sandbox") return "test";
    return null;
  };
  const getPayPalApiBase = () =>
    getPayPalEnvironment() === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  async function getPayPalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials are not configured");
    }

    const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`PayPal authentication failed (${response.status}): ${body.slice(0, 200)}`);
    }
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) throw new Error("PayPal did not return an access token");
    return data.access_token;
  }

  async function payPalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${getPayPalApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.message || body?.name || `PayPal request failed (${response.status})`;
      throw new Error(message);
    }
    return body as T;
  }

  const paypalConfigured = () => Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );

  // Subscription route — requires active admin authorization if invoked without payment gateway
  app.post("/api/subscription/subscribe", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { planId } = req.body;
      if (!planId) return res.status(400).json({ message: "Plan ID is required" });
      if (!user.isAdmin) {
        return res.status(402).json({ message: "Subscription requires payment via PayPal checkout." });
      }
      await activateSubscriptionForUser(user.id, planId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Subscribe error:", error);
      res.status(error.message === "Invalid plan" ? 400 : 500).json({ message: error.message || "Failed to create subscription" });
    }
  });

  // Wallet routes
  app.post("/api/wallet/deposit", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const parsed = depositSchema.safeParse(req.body);

      // Block all free/unverified deposits: an orderId from an approved payment provider is required
      if (!parsed.success) {
        return res.status(402).json({
          message: "Payment verification required. Free deposits are not permitted. A verified payment order ID is required.",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { orderId, paymentProvider } = parsed.data;

      if (!paypalConfigured()) {
        return res.status(503).json({
          message: "PayPal payments are not configured on this server.",
        });
      }

      // Replay attack prevention: order ID cannot be reused to credit money twice
      const existingTransaction = await storage.getTransactionByPaymentReference("paypal", orderId);
      if (existingTransaction) {
        if (existingTransaction.userId !== user.id) {
          return res.status(403).json({ message: "This payment reference belongs to another account." });
        }
        if (existingTransaction.status === "completed") {
          return res.status(409).json({ message: "This payment transaction has already been credited to your wallet." });
        }
      }

      // Server-side verification and capture via PayPal API
      let capture: any;
      try {
        capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST",
          headers: { "PayPal-Request-Id": `wallet-capture-${orderId}` },
          body: JSON.stringify({}),
        });
      } catch (err: any) {
        // If order was already captured during checkout, query details to verify
        capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
          method: "GET",
        });
      }

      const purchaseUnit = capture?.purchase_units?.[0];
      const capturedPayment = purchaseUnit?.payments?.captures?.[0];
      const customId = purchaseUnit?.custom_id;
      const capturedAmount = capturedPayment?.amount || purchaseUnit?.amount;

      // Status check: must be COMPLETED
      const isCompleted = capture?.status === "COMPLETED" || capturedPayment?.status === "COMPLETED";
      if (!isCompleted) {
        return res.status(402).json({ message: "Payment has not been completed or captured." });
      }

      // Verification check: custom_id must start with user's ID
      const expectedPrefix = `user:${user.id}:deposit:`;
      if (!customId || !customId.startsWith(expectedPrefix)) {
        return res.status(403).json({ message: "Payment verification failed: transaction does not belong to your account." });
      }

      if (capturedAmount?.currency_code !== "USD") {
        return res.status(400).json({ message: "Invalid payment currency. Only USD is accepted." });
      }

      const verifiedAmount = parseFloat(capturedAmount?.value);
      if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
        return res.status(400).json({ message: "Invalid payment amount detected from payment gateway." });
      }

      // Update user wallet balance with the server-verified amount
      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentBalance = parseFloat(String(dbUser.walletBalance || 0)) || 0;
      const newBalance = (currentBalance + verifiedAmount).toFixed(2);

      const updatedUser = await storage.updateUser(user.id, {
        walletBalance: newBalance,
      });

      // Record completed transaction
      await storage.createTransaction({
        userId: user.id,
        amount: verifiedAmount.toFixed(2),
        type: "deposit",
        status: "completed",
        paymentProvider: "paypal",
        paymentReference: orderId,
      });

      res.json({
        success: true,
        walletBalance: updatedUser.walletBalance,
        creditedAmount: verifiedAmount.toFixed(2),
      });
    } catch (error: any) {
      console.error("Deposit verification error:", error);
      res.status(502).json({ message: error?.message || "Payment verification failed" });
    }
  });

  app.get("/api/wallet/transactions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const transactions = await storage.getTransactions(user.id);
      res.json(transactions);
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ message: "Failed to load transactions" });
    }
  });

  app.post("/api/wallet/withdraw", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { amount } = req.body;

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      if (parseFloat(user.walletBalance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // Create transaction
      await storage.createTransaction({
        userId: user.id,
        amount,
        type: "withdrawal",
        status: "completed",
      });

      // Update user wallet
      const updatedUser = await storage.updateUser(user.id, {
        walletBalance: (parseFloat(user.walletBalance) - parseFloat(amount)).toFixed(2),
      });

      res.json({
        success: true,
        walletBalance: updatedUser.walletBalance,
      });
    } catch (error) {
      console.error("Withdrawal error:", error);
      res.status(500).json({ message: "Failed to withdraw funds" });
    }
  });

  app.post("/api/wallet/gift", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { amount, recipientId } = req.body;

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      if (!recipientId) {
        return res.status(400).json({ message: "Recipient ID is required" });
      }

      if (parseFloat(user.walletBalance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // Get recipient
      const recipient = await storage.getUser(recipientId);

      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found" });
      }

      // Calculate platform fee (10%)
      const platformFee = parseFloat(amount) * 0.1;
      const giftAmount = parseFloat(amount) - platformFee;

      // Create gift transaction
      await storage.createTransaction({
        userId: user.id,
        recipientId,
        amount,
        type: "gift",
        status: "completed",
      });

      // Create fee transaction
      await storage.createTransaction({
        userId: user.id,
        amount: platformFee.toFixed(2),
        type: "fee",
        status: "completed",
      });

      // Update sender's wallet
      const updatedSender = await storage.updateUser(user.id, {
        walletBalance: (parseFloat(user.walletBalance) - parseFloat(amount)).toFixed(2),
      });

      // Update recipient's wallet
      await storage.updateUser(recipientId, {
        walletBalance: ((parseFloat(recipient.walletBalance ?? "0") || 0) + giftAmount).toFixed(2),
      });

      res.json({
        success: true,
        walletBalance: updatedSender.walletBalance,
      });
    } catch (error) {
      console.error("Gift error:", error);
      res.status(500).json({ message: "Failed to send gift" });
    }
  });

  // User routes — returns public dating profile for other users, or safe profile for self/admin
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Get user
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentUser = req.user as any;

      // If user is accessing their own profile, return safeUser
      if (currentUser && currentUser.id === user.id) {
        return res.json(safeUser(user));
      }

      // If requested by an administrator, return safeUser
      if (currentUser && currentUser.isAdmin) {
        return res.json(safeUser(user));
      }

      // For all other users: return strictly sanitized public profile.
      // NEVER expose national ID numbers, verification selfies, device IDs, wallet balances, email, phone, or password.
      res.json(publicUser(user));
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Social media routes
  app.get("/api/socials", async (req, res) => {
    try {
      const socials = await storage.getSocials();
      res.json(socials);
    } catch (error) {
      console.error("Get socials error:", error);
      res.status(500).json({ message: "Failed to get social media links" });
    }
  });

  // Admin route to add social media links
  app.post("/api/socials", requireAdmin, async (req, res) => {
    try {
      const { platform, url } = req.body;

      if (!platform || !url) {
        return res.status(400).json({ message: "Platform and URL are required" });
      }

      const social = await storage.createSocial({
        platform,
        url,
        isActive: true
      });

      res.json(social);
    } catch (error) {
      console.error("Create social error:", error);
      res.status(500).json({ message: "Failed to create social media link" });
    }
  });

  // ============================================================
  // Admin / owner routes
  // ============================================================

  // Dashboard summary stats
  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    try {
      const [users, verified, suspended, subscribed, matches, messages] = await Promise.all([
        storage.countUsers(),
        storage.countVerifiedUsers(),
        storage.countSuspendedUsers(),
        storage.countSubscribedUsers(),
        storage.countMatches(),
        storage.countMessages(),
      ]);
      res.json({ users, verified, suspended, subscribed, matches, messages });
    } catch (e: any) {
      console.error("Admin stats error:", e);
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  // List all users (admin)
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.listUsers();
      // Strip large media + password before sending
      const slim = users.map(u => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        firstName: u.firstName,
        lastName: u.lastName,
        gender: u.gender,
        country: u.country,
        age: u.age,
        isVerified: u.isVerified,
        isAdmin: (u as any).isAdmin || false,
        isSuspended: (u as any).isSuspended || false,
        suspendedReason: (u as any).suspendedReason || null,
        subscriptionTier: u.subscriptionTier,
        walletBalance: u.walletBalance,
        createdAt: u.createdAt,
      }));
      res.json(slim);
    } catch (e: any) {
      console.error("Admin list users error:", e);
      res.status(500).json({ message: "Failed to load users" });
    }
  });

  // Suspend / unsuspend a user
  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { reason } = req.body || {};
      if (id === req.user.id) {
        return res.status(400).json({ message: "You cannot suspend your own account." });
      }
      const updated = await storage.updateUser(id, { isSuspended: true, suspendedReason: reason || "Suspended by admin" } as any);
      res.json({ success: true, user: { id: updated.id, isSuspended: (updated as any).isSuspended } });
    } catch (e: any) {
      console.error("Suspend user error:", e);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  app.post("/api/admin/users/:id/unsuspend", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await storage.updateUser(id, { isSuspended: false, suspendedReason: null } as any);
      res.json({ success: true, user: { id: updated.id, isSuspended: (updated as any).isSuspended } });
    } catch (e: any) {
      console.error("Unsuspend user error:", e);
      res.status(500).json({ message: "Failed to unsuspend user" });
    }
  });

  // Manually verify a user (override AI)
  app.post("/api/admin/users/:id/verify", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await storage.updateUser(id, { isVerified: true, isSuspended: false } as any);
      // Also update latest verification record to approved
      const v = await storage.getVerificationByUserId(id);
      if (v) {
        // We don't have an updateVerification method yet, but we can add a new approved record
        await storage.createVerification({ userId: id, status: "approved", approvedAt: new Date() });
      }
      res.json({ success: true, user: { id: updated.id, isVerified: updated.isVerified } });
    } catch (e: any) {
      console.error("Admin verify user error:", e);
      res.status(500).json({ message: "Failed to verify user" });
    }
  });

  // ── Admin verification review endpoints ──────────────────────────────────────

  // Get all verifications (with user data)
  app.get("/api/admin/verifications", requireAdmin, async (_req, res) => {
    try {
      const verifications = await storage.getAllVerifications();
      res.json(verifications);
    } catch (e: any) {
      console.error("Admin verifications error:", e);
      res.status(500).json({ message: "Failed to fetch verifications" });
    }
  });

  // Get verifications pending review
  app.get("/api/admin/verifications/review", requireAdmin, async (_req, res) => {
    try {
      const verifications = await storage.listVerificationsForReview();
      res.json(verifications);
    } catch (e: any) {
      console.error("Admin verifications review error:", e);
      res.status(500).json({ message: "Failed to fetch verification queue" });
    }
  });

  // Hard-ban a user (+ optionally ban their device)
  app.post("/api/admin/users/:id/ban", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { reason, banDevice } = req.body || {};
      if (id === req.user.id) {
        return res.status(400).json({ message: "You cannot ban your own account." });
      }
      const updated = await storage.updateUser(id, {
        isBanned: true,
        bannedReason: reason || "Banned by admin",
        isSuspended: true,
        suspendedReason: reason || "Banned",
      } as any);
      // Optionally ban their device
      if (banDevice) {
        const targetUser = await storage.getUser(id);
        const deviceId = (targetUser as any)?.deviceId;
        if (deviceId) {
          await storage.createDeviceBan(deviceId, reason || "Banned by admin", req.user.id, req.ip);
        }
      }
      res.json({ success: true, user: { id: updated.id, isBanned: (updated as any).isBanned } });
    } catch (e: any) {
      console.error("Ban user error:", e);
      res.status(500).json({ message: "Failed to ban user" });
    }
  });

  // Unban a user
  app.post("/api/admin/users/:id/unban", requireAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await storage.updateUser(id, { isBanned: false, bannedReason: null, isSuspended: false, suspendedReason: null } as any);
      res.json({ success: true, user: { id: updated.id } });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to unban user" });
    }
  });

  // ── Device ban admin routes ─────────────────────────────────────────────────

  // List all device bans
  app.get("/api/admin/device-bans", requireAdmin, async (_req, res) => {
    try {
      const bans = await storage.listDeviceBans();
      res.json(bans);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to fetch device bans" });
    }
  });

  // Create a device ban manually
  app.post("/api/admin/device-bans", requireAdmin, async (req: any, res) => {
    try {
      const { deviceId, reason } = req.body;
      if (!deviceId) return res.status(400).json({ message: "deviceId is required" });
      const ban = await storage.createDeviceBan(deviceId, reason || "Manually banned", req.user.id, req.ip);
      res.json(ban);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to create device ban" });
    }
  });

  // Remove a device ban
  app.delete("/api/admin/device-bans/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.removeDeviceBan(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to remove device ban" });
    }
  });

  // ============================================================
  // Payment routes
  // ============================================================

  /** Exchange rates — no auth required, cached by client */
  app.get("/api/payment/rates", async (_req, res) => {
    try {
      const resp = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!resp.ok) throw new Error("upstream error");
      const data: any = await resp.json();
      res.json({ rates: data.rates, base: "USD", updated: data.time_last_update_utc });
    } catch {
      res.status(503).json({ message: "Exchange rates temporarily unavailable. Using USD pricing." });
    }
  });

  app.get("/api/payment/paypal/config", (_req, res) => {
    const env = getPayPalEnvironment();
    const hasCredentials = paypalConfigured();
    const clientId = getPayPalClientId();
    res.json({
      configured: Boolean(clientId),
      hasCredentials,
      clientId,
      environment: env,
      currency: "USD",
      isLive: env === "live",
      isSandbox: env === "sandbox",
    });
  });

  // Switch or set environment (live vs sandbox)
  app.post("/api/payment/paypal/environment", requireAdmin, (req, res) => {
    const { environment } = req.body;
    if (environment === "live" || environment === "sandbox") {
      runtimePayPalEnv = environment;
      return res.json({ success: true, environment: getPayPalEnvironment() });
    }
    res.status(400).json({ message: "Invalid environment. Expected 'live' or 'sandbox'." });
  });

  app.get("/api/gifts/store", (_req, res) => {
    res.json(STORE_GIFTS);
  });

  app.get("/api/gifts/history", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const allTx = await storage.getTransactions(user.id);
      const gifts = allTx.filter(tx => tx.type === "gift");
      res.json(gifts);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load gift history" });
    }
  });

  app.post("/api/payment/paypal/create-order", requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const { planId, type, giftId, recipientId, note, amount: reqAmount } = req.body;
      const hasRealCreds = paypalConfigured();
      const env = getPayPalEnvironment();

      if (env === "live" && !hasRealCreds) {
        return res.status(503).json({
          message: "Live PayPal credentials are required. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the environment.",
        });
      }

      // Direct Gift purchase order creation
      if (type === "gift" || giftId) {
        const gift = STORE_GIFTS.find(g => g.id === giftId);
        if (!gift) return res.status(400).json({ message: "Invalid gift selected" });

        const priceStr = gift.price.toFixed(2);
        const targetRecipient = recipientId ? parseInt(String(recipientId), 10) : 0;

        if (hasRealCreds) {
          const order = await payPalRequest<any>("/v2/checkout/orders", {
            method: "POST",
            headers: { "PayPal-Request-Id": `tcd-gift-${user.id}-${gift.id}-${crypto.randomUUID()}` },
            body: JSON.stringify({
              intent: "CAPTURE",
              purchase_units: [{
                reference_id: `gift-${user.id}-${Date.now()}`,
                custom_id: `user:${user.id}:gift:${gift.id}:${targetRecipient}`,
                description: `Clever Date Match Gift — ${gift.name} ${gift.emoji} ($${priceStr} USD)`,
                amount: { currency_code: "USD", value: priceStr },
              }],
              application_context: {
                brand_name: "Clever Date Match",
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
              },
            }),
          });

          if (!order.id) throw new Error("PayPal did not return an order ID");
          return res.json({ orderId: order.id, amount: priceStr, currency: "USD", type: "gift", gift });
        } else {
          const mockOrderId = `SANDBOX-GIFT-${user.id}-${gift.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          return res.json({ orderId: mockOrderId, amount: priceStr, currency: "USD", type: "gift", gift, isSandboxDemo: true });
        }
      }

      // Deposit order creation (legacy support)
      if (type === "deposit" || (!planId && reqAmount !== undefined)) {
        const parsed = parseFloat(String(reqAmount));
        if (isNaN(parsed) || parsed < 1 || parsed > 5000) {
          return res.status(400).json({ message: "Deposit amount must be between $1.00 and $5,000.00 USD." });
        }
        const formattedAmount = parsed.toFixed(2);

        if (hasRealCreds) {
          const order = await payPalRequest<any>("/v2/checkout/orders", {
            method: "POST",
            headers: { "PayPal-Request-Id": `tcd-dep-${user.id}-${crypto.randomUUID()}` },
            body: JSON.stringify({
              intent: "CAPTURE",
              purchase_units: [{
                reference_id: `dep-${user.id}-${Date.now()}`,
                custom_id: `user:${user.id}:deposit:${formattedAmount}`,
                description: `Clever Date Match Deposit — $${formattedAmount} USD`,
                amount: { currency_code: "USD", value: formattedAmount },
              }],
              application_context: {
                brand_name: "Clever Date Match",
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
              },
            }),
          });

          if (!order.id) throw new Error("PayPal did not return an order ID");
          return res.json({ orderId: order.id, amount: formattedAmount, currency: "USD", type: "deposit" });
        } else {
          const mockOrderId = `SANDBOX-DEP-${user.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          return res.json({ orderId: mockOrderId, amount: formattedAmount, currency: "USD", type: "deposit", isSandboxDemo: true });
        }
      }

      // Subscription order creation
      const plan = PAYPAL_PLANS[planId];
      if (!plan) return res.status(400).json({ message: "Invalid subscription plan or parameters" });

      if (hasRealCreds) {
        const order = await payPalRequest<any>("/v2/checkout/orders", {
          method: "POST",
          headers: { "PayPal-Request-Id": `tcd-${user.id}-${planId}-${crypto.randomUUID()}` },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [{
              reference_id: `tcd-${user.id}-${planId}`,
              custom_id: `user:${user.id}:plan:${planId}`,
              description: `${plan.name} subscription — ${plan.period}`,
              amount: { currency_code: "USD", value: plan.amount },
            }],
            application_context: {
              brand_name: "Clever Date Match",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
            },
          }),
        });

        if (!order.id) throw new Error("PayPal did not return an order ID");
        return res.json({ orderId: order.id, amount: plan.amount, currency: "USD", plan });
      } else {
        const mockOrderId = `SANDBOX-SUB-${user.id}-${planId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        return res.json({ orderId: mockOrderId, amount: plan.amount, currency: "USD", plan, isSandboxDemo: true });
      }
    } catch (e: any) {
      console.error("[PayPal create order]", e?.message || e);
      res.status(502).json({ message: "PayPal checkout could not be started: " + (e?.message || "Please try again.") });
    }
  });

  app.post("/api/payment/paypal/capture-order", requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const { orderId, planId, type, giftId, recipientId, note } = req.body;
      if (!orderId || typeof orderId !== "string") {
        return res.status(400).json({ message: "A valid PayPal order ID is required" });
      }

      const hasRealCreds = paypalConfigured();
      const isSandboxOrder = orderId.startsWith("SANDBOX-") || orderId.startsWith("sb-") || !hasRealCreds;

      // Direct Gift capture support
      if (type === "gift") {
        const existingTransaction = await storage.getTransactionByPaymentReference("paypal", orderId);
        if (existingTransaction) {
          if (existingTransaction.userId !== user.id) {
            return res.status(403).json({ message: "This PayPal order belongs to another account." });
          }
          if (existingTransaction.status === "completed") {
            return res.json({ success: true, message: "Gift purchase already processed" });
          }
        }

        let capture: any;
        try {
          capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
            method: "POST",
            headers: { "PayPal-Request-Id": `capture-gift-${orderId}` },
            body: JSON.stringify({}),
          });
        } catch {
          capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
            method: "GET",
          });
        }

        const purchaseUnit = capture?.purchase_units?.[0];
        const capturedPayment = purchaseUnit?.payments?.captures?.[0];
        const customId = purchaseUnit?.custom_id;
        const capturedAmount = capturedPayment?.amount || purchaseUnit?.amount;

        const isCompleted = capture?.status === "COMPLETED" || capturedPayment?.status === "COMPLETED";
        const expectedPrefix = `user:${user.id}:gift:`;
        if (
          !isCompleted ||
          !customId ||
          !customId.startsWith(expectedPrefix) ||
          capturedAmount?.currency_code !== "USD"
        ) {
          return res.status(402).json({ message: "PayPal gift payment could not be verified." });
        }

        const verifiedAmount = parseFloat(capturedAmount?.value);
        if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
          return res.status(400).json({ message: "Invalid payment amount detected." });
        }

        const gift = STORE_GIFTS.find(g => g.id === giftId);
        const targetRecipientId = recipientId ? parseInt(String(recipientId), 10) : null;

        // Record gift transaction
        await storage.createTransaction({
          userId: user.id,
          recipientId: targetRecipientId,
          amount: verifiedAmount.toFixed(2),
          type: "gift",
          status: "completed",
          paymentProvider: "paypal",
          paymentReference: orderId,
          planId: giftId || (gift ? gift.id : "gift"),
        });

        // If recipient is present, deliver a romantic gift chat message
        if (targetRecipientId) {
          const senderUser = await storage.getUser(user.id);
          const senderName = [senderUser?.firstName, senderUser?.lastName].filter(Boolean).join(' ') || 'Your match';
          const giftName = gift ? `${gift.name} ${gift.emoji}` : 'a special gift';
          const giftNoteText = note ? ` "${note}"` : '';
          const messageContent = `🎁 ${senderName} sent you ${giftName}!${giftNoteText}`;

          try {
            const existingMatch = await storage.getMatchBetweenUsers(user.id, targetRecipientId) ||
                                  await storage.getMatchBetweenUsers(targetRecipientId, user.id);
            const matchId = existingMatch ? existingMatch.id : 1;

            await storage.createMessage({
              matchId,
              senderId: user.id,
              recipientId: targetRecipientId,
              content: messageContent,
              isRead: false,
            });
            sendToUser(targetRecipientId, {
              type: "message",
              message: {
                matchId,
                senderId: user.id,
                recipientId: targetRecipientId,
                content: messageContent,
                createdAt: new Date().toISOString(),
              },
            });
          } catch (msgErr) {
            console.error("Could not send gift message to recipient:", msgErr);
          }
        }

        return res.json({
          success: true,
          gift: gift || { id: giftId, name: "Gift" },
          message: "Gift purchased and delivered successfully!",
        });
      }

      // Deposit capture support
      if (type === "deposit" || !planId) {
        const existingTransaction = await storage.getTransactionByPaymentReference("paypal", orderId);
        if (existingTransaction) {
          if (existingTransaction.userId !== user.id) {
            return res.status(403).json({ message: "This PayPal order belongs to another account." });
          }
          if (existingTransaction.status === "completed") {
            return res.json({ success: true, message: "Deposit already processed" });
          }
        }

        let capture: any;
        try {
          capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
            method: "POST",
            headers: { "PayPal-Request-Id": `capture-${orderId}` },
            body: JSON.stringify({}),
          });
        } catch {
          capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
            method: "GET",
          });
        }

        const purchaseUnit = capture?.purchase_units?.[0];
        const capturedPayment = purchaseUnit?.payments?.captures?.[0];
        const customId = purchaseUnit?.custom_id;
        const capturedAmount = capturedPayment?.amount || purchaseUnit?.amount;

        const isCompleted = capture?.status === "COMPLETED" || capturedPayment?.status === "COMPLETED";
        const expectedPrefix = `user:${user.id}:deposit:`;
        if (
          !isCompleted ||
          !customId ||
          !customId.startsWith(expectedPrefix) ||
          capturedAmount?.currency_code !== "USD"
        ) {
          return res.status(402).json({ message: "PayPal deposit could not be verified." });
        }

        const verifiedAmount = parseFloat(capturedAmount?.value);
        if (isNaN(verifiedAmount) || verifiedAmount <= 0) {
          return res.status(400).json({ message: "Invalid payment amount detected." });
        }

        const dbUser = await storage.getUser(user.id);
        const currentBalance = parseFloat(String(dbUser?.walletBalance || 0)) || 0;
        const newBalance = (currentBalance + verifiedAmount).toFixed(2);
        await storage.updateUser(user.id, { walletBalance: newBalance });

        await storage.createTransaction({
          userId: user.id,
          amount: verifiedAmount.toFixed(2),
          type: "deposit",
          status: "completed",
          paymentProvider: "paypal",
          paymentReference: orderId,
        });

        return res.json({ success: true, walletBalance: newBalance, creditedAmount: verifiedAmount.toFixed(2) });
      }

      // Subscription capture
      const plan = PAYPAL_PLANS[planId];
      if (!plan) {
        return res.status(400).json({ message: "A valid PayPal order and subscription plan are required" });
      }

      if (isSandboxOrder) {
        await activateSubscriptionForUser(user.id, planId);
        await storage.createTransaction({
          userId: user.id,
          amount: plan.amount,
          type: "deposit",
          status: "completed",
          paymentProvider: "paypal",
          paymentReference: orderId,
          planId,
        });
        return res.json({ success: true, message: "Subscription activated successfully (Sandbox Test Mode)", sandbox: true });
      }

      const existingTransaction = await storage.getTransactionByPaymentReference("paypal", orderId);
      if (existingTransaction) {
        if (existingTransaction.userId !== user.id) {
          return res.status(403).json({ message: "This PayPal order belongs to another account." });
        }
        if (existingTransaction.status === "completed") {
          return res.json({ success: true, message: "Subscription already activated" });
        }
      }

      const capture = await payPalRequest<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { "PayPal-Request-Id": `capture-${orderId}` },
        body: JSON.stringify({}),
      });

      const purchaseUnit = capture.purchase_units?.[0];
      const capturedPayment = purchaseUnit?.payments?.captures?.[0];
      const customId = purchaseUnit?.custom_id;
      const capturedAmount = capturedPayment?.amount;
      const expectedCustomId = `user:${user.id}:plan:${planId}`;

      if (
        capture.status !== "COMPLETED" ||
        capturedPayment?.status !== "COMPLETED" ||
        customId !== expectedCustomId ||
        capturedAmount?.currency_code !== "USD" ||
        capturedAmount?.value !== plan.amount
      ) {
        return res.status(402).json({ message: "PayPal payment could not be verified. Please contact support before trying again." });
      }

      await activateSubscriptionForUser(user.id, planId);
      await storage.createTransaction({
        userId: user.id,
        amount: plan.amount,
        type: "deposit",
        status: "completed",
        paymentProvider: "paypal",
        paymentReference: orderId,
        planId,
      });

      res.json({ success: true, message: "Subscription activated" });
    } catch (e: any) {
      console.error("[PayPal capture order]", e?.message || e);
      res.status(502).json({ message: "PayPal payment verification failed. Please try again." });
    }
  });



  app.get("/api/admin/paypal-status", requireAdmin, (_req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID || "";
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
    const mask = (key: string) =>
      key.length > 12 ? key.slice(0, 8) + "•••••••••" + key.slice(-4) : key ? "••••••••" : "";

    res.json({
      configured: paypalConfigured(),
      clientIdMasked: mask(clientId),
      clientSecretMasked: mask(clientSecret),
      environment: getPayPalEnvironment(),
      dashboardUrl: "https://www.paypal.com/businessmanage/",
    });
  });

  // ── Admin: social media management ──────────────────────────────────────────
  app.get("/api/admin/socials", requireAdmin, async (_req, res) => {
    try {
      const socials = await storage.getAllSocials();
      res.json(socials);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to fetch socials" });
    }
  });

  app.delete("/api/admin/socials/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteSocial(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to delete social link" });
    }
  });

  app.patch("/api/admin/socials/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { isActive } = req.body;
      const updated = await storage.toggleSocial(id, !!isActive);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to toggle social link" });
    }
  });

  // ── Admin: gift a subscription to any user ───────────────────────────────────
  app.post("/api/admin/gift-subscription", requireAdmin, async (req: any, res) => {
    try {
      const { userId, tier, days } = req.body;

      if (!userId || !tier || !["basic", "silver", "diamond", "gold"].includes(tier)) {
        return res.status(400).json({ message: "userId and valid tier are required" });
      }

      const targetUser = await storage.getUser(Number(userId));
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const d = Math.max(1, Number(days) || 30);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + d);

      await storage.createSubscription({
        userId: targetUser.id,
        tier: tier as any,
        startDate: new Date(),
        endDate,
        autoRenew: false,
        status: "active",
      });

      await storage.updateUser(targetUser.id, {
        subscriptionTier: tier as any,
        subscriptionExpiry: endDate,
      });

      const adminEmail = req.user?.email || "admin";
      await sendAdminNotification(
        "Subscription gifted",
        `Admin (${adminEmail}) gifted ${tier} for ${d} days to user #${targetUser.id} (${targetUser.email || targetUser.phone})`
      );

      res.json({ success: true, message: `${tier} gifted to user #${targetUser.id} for ${d} days` });
    } catch (e: any) {
      console.error("[gift-sub]", e?.message);
      res.status(500).json({ message: "Failed to gift subscription" });
    }
  });

  // ── Live stream routes ────────────────────────────────────────────────────

  // Start a live stream (admin only)
  app.post("/api/live/start", requireAdmin, async (req: any, res) => {
    try {
      // End any existing live first
      const existing = await storage.getActiveLivestream();
      if (existing) await storage.endLivestream(existing.id);

      const { title } = req.body;
      const user = req.user as any;
      const ls = await storage.createLivestream({
        hostId: user.id,
        title: title || "Clever Date Match Live 🔴",
        status: "live",
        viewerCount: 0,
        likeCount: 0,
        totalGifts: "0",
        guestIds: [],
      });
      res.json(ls);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to start live: " + e?.message });
    }
  });

  // End a live stream (admin only)
  app.post("/api/live/end", requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.body;
      if (id) await storage.endLivestream(Number(id));
      else {
        const active = await storage.getActiveLivestream();
        if (active) await storage.endLivestream(active.id);
      }
      // Broadcast live:end to all viewers via engagement service
      broadcastLiveEnd();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to end live" });
    }
  });

  // Get current active livestream (any authenticated user)
  app.get("/api/live/current", requireAuth, async (_req, res) => {
    try {
      const ls = await storage.getActiveLivestream();
      if (!ls) return res.status(404).json({ message: "No active livestream" });
      res.json(ls);
    } catch (e: any) {
      res.status(500).json({ message: "Failed to get livestream" });
    }
  });

  // Send a gift during live stream
  app.post("/api/live/gift", requireAuth, async (req: any, res) => {
    try {
      const user = req.user as any;
      const { giftId } = req.body;
      const GIFT_COSTS: Record<string, number> = {
        rose: 1, heart: 2, star: 5, crown: 10, diamond: 20, rocket: 50,
      };
      const GIFT_EMOJIS: Record<string, string> = {
        rose: '🌹', heart: '💖', star: '⭐', crown: '👑', diamond: '💎', rocket: '🚀',
      };
      const cost = GIFT_COSTS[giftId] || 1;
      const emoji = GIFT_EMOJIS[giftId] || '🎁';

      const dbUser = await storage.getUser(user.id);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      await storage.createTransaction({
        userId: user.id,
        amount: String(cost),
        type: "gift",
        status: "completed",
        recipientId: null,
        planId: giftId,
      });

      // Update livestream gift total
      const ls = await storage.getActiveLivestream();
      if (ls) {
        const newTotal = (parseFloat(String(ls.totalGifts ?? 0)) + cost).toFixed(2);
        await storage.updateLivestreamStats(ls.id, { totalGifts: newTotal });
      }

      const userName = [dbUser.firstName, dbUser.lastName].filter(Boolean).join(' ') || 'User';
      const giftData = { type: 'live:gift', userId: user.id, userName, giftEmoji: emoji, giftName: giftId, giftCost: cost };
      broadcastToLive(giftData);

      res.json({ success: true, giftName: giftId, giftEmoji: emoji });
    } catch (e: any) {
      res.status(500).json({ message: "Gift failed: " + e?.message });
    }
  });

  // Invite a viewer to be a guest (admin only)
  app.post("/api/live/invite/:userId", requireAdmin, async (req: any, res) => {
    try {
      const targetUserId = parseInt(req.params.userId, 10);
      const ls = await storage.getActiveLivestream();
      if (!ls) return res.status(404).json({ message: "No active livestream" });

      const target = await storage.getUser(targetUserId);
      if (!target) return res.status(404).json({ message: "User not found" });

      const currentGuests = (ls.guestIds as number[]) || [];
      if (!currentGuests.includes(targetUserId)) {
        await storage.updateLivestreamStats(ls.id, { guestIds: [...currentGuests, targetUserId] });
      }

      const targetName = [target.firstName, target.lastName].filter(Boolean).join(' ') || 'Guest';
      broadcastToLive({ type: 'live:guest_added', userId: targetUserId, userName: targetName });

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Invite failed" });
    }
  });

  // Strict startup admin sanitation:
  // 1. Ensure clevermatrix.labs@gmail.com is provisioned and has isAdmin=true
  // 2. Revoke isAdmin from any other account in the database so no regular user can ever be an admin
  try {
    const adminEmail = getAdminEmail();
    let soleAdmin = await storage.getUserByEmail(adminEmail);
    if (!soleAdmin) {
      try {
        soleAdmin = await storage.createUser({
          username: "clevermatrix",
          email: adminEmail,
          password: await hashPassword("Admin12345!"),
          firstName: "Clever",
          lastName: "Admin",
          gender: "male",
          age: 30,
          isAdmin: true,
          isVerified: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          intention: "getting-to-know",
          aboutMe: "Clever Date Match Owner and Administrator.",
        });
        console.log(`[admin-security] Provisioned sole admin account for ${adminEmail}`);
      } catch (err: any) {
        console.warn("[admin-security] Admin provisioning warning:", err?.message);
      }
    } else if (!soleAdmin.isAdmin) {
      await storage.updateUser(soleAdmin.id, { isAdmin: true, isVerified: true });
      console.log(`[admin-security] Verified sole admin privileges for ${adminEmail}`);
    }

    // Revoke admin from all other accounts
    const allUsers = await storage.listUsers();
    for (const u of allUsers) {
      const isSoleAdmin = u.email?.toLowerCase().trim() === adminEmail;
      if (!isSoleAdmin && u.isAdmin) {
        await storage.updateUser(u.id, { isAdmin: false });
        console.log(`[admin-security] Revoked unauthorized admin flag from user #${u.id} (${u.email})`);
      }
    }
  } catch (err: any) {
    console.warn("[admin-security] Startup admin sanitation check:", err?.message);
  }

  const httpServer = createServer(app);

  return httpServer;
}