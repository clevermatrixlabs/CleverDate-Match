import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { json, urlencoded } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import * as crypto from "crypto";
import { z } from "zod";
import { 
  loginSchema, 
  registerSchema,
  phoneRegisterSchema,
  profileSchema,
  insertMatchSchema, 
  insertMessageSchema,
  insertTransactionSchema,
  insertVerificationSchema
} from "../shared/schema";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import { sendVerificationCode, isEmailConfigured } from "./email";

// Multer — keep files in memory as Buffers, convert to base64 data URLs for storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

declare module "express-session" {
  interface SessionData {
    userId: number;
    emailCode: string;
    emailCodeExpiresAt: number;
    phoneCode: string;
    phoneCodeExpiresAt: number;
    pendingUserId: number;
  }
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit numeric

export async function registerRoutes(app: Express): Promise<Server> {
  // Parse JSON and URL-encoded bodies
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Setup session
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
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

        if (user.password !== password) {
          return done(null, false, { message: "Incorrect password" });
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

  // Auth middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Helper to build safe user response
  const safeUser = (user: any) => ({
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    religion: user.religion,
    aboutMe: user.aboutMe,
    interests: user.interests,
    location: user.location,
    country: user.country,
    nationalIdType: user.nationalIdType,
    age: user.age,
    isVerified: user.isVerified,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    profilePicture: user.profilePicture,
    profileVideo: user.profileVideo,
    additionalPicture1: user.additionalPicture1,
    additionalPicture2: user.additionalPicture2,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiry: user.subscriptionExpiry,
    walletBalance: user.walletBalance,
    isAdmin: !!user.isAdmin,
    isSuspended: !!user.isSuspended,
  });

  // Auto-promote the configured ADMIN_EMAIL to admin (idempotent, safe to call repeatedly).
  const ensureAdminFlag = async (user: any) => {
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    if (!adminEmail) return user;
    if (user?.email?.toLowerCase() === adminEmail && !user.isAdmin) {
      try {
        const updated = await storage.updateUser(user.id, { isAdmin: true } as any);
        return updated || user;
      } catch (e) {
        console.warn("Failed to auto-promote admin:", (e as any)?.message);
      }
    }
    return user;
  };

  // Admin middleware
  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await ensureAdminFlag(req.user);
    if (!user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.user = user;
    next();
  };

  // Auth routes — email-based registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);

      // Check if email already registered
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(409).json({ message: "An account with that email already exists. Please log in." });
      }

      // Derive a username from the email (part before @)
      const baseUsername = validatedData.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
      let username = baseUsername;
      let counter = 1;
      while (await storage.getUserByUsername(username)) {
        username = `${baseUsername}${counter++}`;
      }

      const newUser = await storage.createUser({
        username,
        email: validatedData.email.toLowerCase(),
        password: validatedData.password,
        country: validatedData.country,
        walletBalance: "0",
        isVerified: false,
        isEmailVerified: false,
        isPhoneVerified: false,
      });

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

  // Phone-based registration
  app.post("/api/auth/register-phone", async (req, res) => {
    try {
      const validatedData = phoneRegisterSchema.parse(req.body);

      // Check if phone already registered
      const existingUser = await storage.getUserByPhone(validatedData.phone);
      if (existingUser) {
        return res.status(409).json({ message: "An account with that phone number already exists. Please log in." });
      }

      // Derive a username from phone
      const baseUsername = `user${validatedData.phone.replace(/\D/g, "").slice(-8)}`;
      let username = baseUsername;
      let counter = 1;
      while (await storage.getUserByUsername(username)) {
        username = `${baseUsername}${counter++}`;
      }

      const newUser = await storage.createUser({
        username,
        phone: validatedData.phone,
        password: validatedData.password,
        country: validatedData.country,
        walletBalance: "0",
        isVerified: false,
        isEmailVerified: false,
        isPhoneVerified: false,
      });

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
      console.error("Register-phone error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // Send OTP (simulated — in production use Twilio/AWS SNS)
  app.post("/api/auth/send-otp", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.phoneCode = otp;
    req.session.pendingUserId = 0;
    
    // In production: send via Twilio. For now, return it in dev mode.
    console.log(`[OTP for ${phone}]: ${otp}`);
    res.json({ 
      success: true, 
      message: "OTP sent to your phone number",
      // Only expose in development for testing:
      ...(process.env.NODE_ENV !== "production" ? { otp } : {})
    });
  });

  // Verify OTP for phone login
  app.post("/api/auth/verify-otp", async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    if (req.session.phoneCode !== otp) {
      return res.status(401).json({ message: "Invalid or expired OTP. Please try again." });
    }

    let user = await storage.getUserByPhone(phone);
    if (!user) {
      return res.status(404).json({ message: "No account found with that phone number", needsRegistration: true });
    }

    req.logIn(user, (err) => {
      if (err) return res.status(500).json({ message: "Login failed" });
      req.session.phoneCode = "";
      return res.json(safeUser(user));
    });
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
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        return res.json(safeUser(user));
      });
    } catch (error) {
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(safeUser(user));
  });

  // Verification route — real on-device face match + duplicate detection
  app.post("/api/verification", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const {
        selfieDescriptor,
        idDescriptor,
        verificationData,
        idImage,
        nationalId,
        nationalIdType,
      } = req.body;

      const isDescriptor = (d: any) =>
        Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === "number" && Number.isFinite(n));

      if (!isDescriptor(selfieDescriptor)) {
        return res.status(400).json({ message: "Live face scan was not completed. Please retry the face scan." });
      }
      if (!isDescriptor(idDescriptor)) {
        return res.status(400).json({ message: "We couldn't detect a face on your ID document. Please upload a clearer photo." });
      }
      if (!nationalId || String(nationalId).trim().length < 4) {
        return res.status(400).json({ message: "National ID is required." });
      }

      // Euclidean distance between selfie and ID face
      const FACE_MATCH_THRESHOLD = 0.6; // face-api.js standard
      const distance = Math.sqrt(
        selfieDescriptor.reduce((s: number, v: number, i: number) => s + (v - idDescriptor[i]) ** 2, 0),
      );

      if (distance > FACE_MATCH_THRESHOLD) {
        await storage.createVerification({
          userId: user.id,
          status: "rejected",
          verificationData: verificationData || null,
          rejectedReason: `Face on ID does not match selfie (distance=${distance.toFixed(3)})`,
        });
        return res.status(400).json({
          message: "The face in your selfie doesn't match the face on your ID. Please try again with a clearer ID photo.",
        });
      }

      // Duplicate-account check: reject if another verified user has a near-identical face
      const DUP_THRESHOLD = 0.45;
      const allUsers = await storage.listUsers();
      for (const other of allUsers) {
        if (other.id === user.id) continue;
        if (!other.isVerified) continue;
        const otherDesc: any = (other as any).faceDescriptor;
        if (!Array.isArray(otherDesc) || otherDesc.length !== 128) continue;
        const dDup = Math.sqrt(
          selfieDescriptor.reduce((s: number, v: number, i: number) => s + (v - Number(otherDesc[i])) ** 2, 0),
        );
        if (dDup < DUP_THRESHOLD) {
          await storage.createVerification({
            userId: user.id,
            status: "rejected",
            verificationData: verificationData || null,
            rejectedReason: `Duplicate face detected — already verified as user #${other.id}`,
          });
          return res.status(400).json({
            message: "This face is already registered to another account. Each person may only have one account on Tim Clever Date.",
          });
        }
      }

      // Approved
      await storage.createVerification({
        userId: user.id,
        status: "approved",
        verificationData: verificationData || null,
        approvedAt: new Date().toISOString(),
      });

      const emailCode = generateCode();
      const phoneCode = generateCode();
      req.session.emailCode = emailCode;
      req.session.emailCodeExpiresAt = Date.now() + CODE_TTL_MS;
      req.session.phoneCode = phoneCode;
      req.session.phoneCodeExpiresAt = Date.now() + CODE_TTL_MS;
      req.session.pendingUserId = user.id;

      await storage.updateUser(user.id, {
        isVerified: true,
        nationalIdNumber: String(nationalId).trim(),
        nationalIdType: nationalIdType || "National ID",
        faceDescriptor: selfieDescriptor,
      } as any);

      // Send the email code asynchronously — don't block the response
      let emailSent = false;
      if (user.email) {
        const result = await sendVerificationCode(user.email, emailCode, user.firstName);
        emailSent = result.sent;
        if (!result.sent) console.warn(`[verify] Email code for ${user.email}: ${emailCode} (delivery failed: ${result.reason})`);
      } else {
        console.log(`[verify] No email on user, code: ${emailCode}`);
      }
      // Phone code: still log until SMS is wired up
      console.log(`[verify] Phone code for user #${user.id}: ${phoneCode}`);

      return res.json({
        success: true,
        message: "Verification successful",
        matchDistance: Number(distance.toFixed(3)),
        emailSent,
      });
    } catch (error: any) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed: " + (error?.message || "unknown error") });
    }
  });

  // Email verification endpoint
  app.post("/api/verify/email", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { code } = req.body;
      const { emailCode, emailCodeExpiresAt } = req.session;

      if (!code) return res.status(400).json({ message: "Verification code is required" });
      if (!emailCode) return res.status(400).json({ message: "No code on file. Please request a new code." });
      if (emailCodeExpiresAt && Date.now() > emailCodeExpiresAt) {
        return res.status(400).json({ message: "Code expired. Please request a new code." });
      }
      if (String(code).trim() !== emailCode) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      await storage.updateUser(user.id, { isEmailVerified: true });

      delete req.session.emailCode;
      delete req.session.emailCodeExpiresAt;

      res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Email verification failed" });
    }
  });

  // Resend email verification code
  app.post("/api/verify/email/resend", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.email) return res.status(400).json({ message: "No email on file" });

      const code = generateCode();
      req.session.emailCode = code;
      req.session.emailCodeExpiresAt = Date.now() + CODE_TTL_MS;

      const result = await sendVerificationCode(user.email, code, user.firstName);
      if (!result.sent) {
        if (!isEmailConfigured()) {
          console.log(`[verify] Email code (not sent — gmail not configured): ${code}`);
          return res.json({ success: true, sent: false, message: "Email not configured. Code logged to server console." });
        }
        return res.status(502).json({ message: `Could not send email: ${result.reason}` });
      }
      res.json({ success: true, sent: true, message: "A new code has been emailed to you." });
    } catch (error: any) {
      console.error("Resend email code error:", error);
      res.status(500).json({ message: "Could not resend code" });
    }
  });

  // Phone verification endpoint
  app.post("/api/verify/phone", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { code } = req.body;
      const { phoneCode, phoneCodeExpiresAt } = req.session;

      if (!code) return res.status(400).json({ message: "Verification code is required" });
      if (!phoneCode) return res.status(400).json({ message: "No code on file. Please request a new code." });
      if (phoneCodeExpiresAt && Date.now() > phoneCodeExpiresAt) {
        return res.status(400).json({ message: "Code expired. Please request a new code." });
      }
      if (String(code).trim() !== phoneCode) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      await storage.updateUser(user.id, { isPhoneVerified: true });

      delete req.session.phoneCode;
      delete req.session.phoneCodeExpiresAt;

      res.json({ success: true, message: "Phone verified successfully" });
    } catch (error) {
      console.error("Phone verification error:", error);
      res.status(500).json({ message: "Phone verification failed" });
    }
  });

  // Profile routes — accepts multipart/form-data with optional photo/video files
  app.post(
    "/api/users/profile",
    requireAuth,
    upload.fields([
      { name: "primaryPhoto", maxCount: 1 },
      { name: "profileVideo", maxCount: 1 },
      { name: "additionalPhoto", maxCount: 1 },
    ]),
    async (req: any, res) => {
      try {
        const user = req.user as any;

        // Validate text fields — age comes as a string from FormData
        const validatedData = profileSchema.parse({
          ...req.body,
          age: req.body.age ? parseInt(req.body.age, 10) : undefined,
        });

        // We only record that media was uploaded — storing multi-MB base64 blobs
        // in MemStorage makes every /api/auth/me response huge and slow.
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } || {};

        const updates: any = { ...validatedData };
        if (files.primaryPhoto?.[0]) updates.profilePicture = `uploaded:${files.primaryPhoto[0].size}b`;
        if (files.profileVideo?.[0]) updates.profileVideo = `uploaded:${files.profileVideo[0].size}b`;
        if (files.additionalPhoto?.[0]) updates.additionalPicture1 = `uploaded:${files.additionalPhoto[0].size}b`;

        await storage.updateUser(user.id, updates);

        res.json({ success: true });
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

  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      // Update user
      const updatedUser = await storage.updateUser(user.id, req.body);

      res.json(updatedUser);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
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
    if (!u.lastName) missing.push("Last name");
    if (!u.age || u.age < 18) missing.push("Age");
    if (!u.gender) missing.push("Gender");
    if (!u.intention) missing.push("What you're looking for (intention)");
    if (!u.profilePicture) missing.push("Profile photo");
    if (!u.aboutMe || u.aboutMe.trim().length < 10) missing.push("Bio (at least 10 characters)");
    if (!u.interests || (u.interests as string[]).length === 0) missing.push("At least one interest");
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

  // Match routes
  app.get("/api/matches/potential", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;

      // Must be verified
      if (!user.isVerified) {
        return res.status(403).json({
          message: "You must complete face & ID verification before matching.",
          requiresVerification: true,
        });
      }

      // Must have a complete profile
      const missing = getProfileMissingFields(user);
      if (missing.length > 0) {
        return res.status(403).json({
          message: "Complete your profile before matching.",
          requiresProfile: true,
          missingFields: missing,
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

      // Filter by age preferences
      const minAge = user.minAgePreference ?? 18;
      const maxAge = user.maxAgePreference ?? 100;
      potentialMatches = potentialMatches.filter(
        (m) => !m.age || (m.age >= minAge && m.age <= maxAge)
      );

      // Filter by preferred countries if set
      if (user.preferredCountries && (user.preferredCountries as string[]).length > 0) {
        const preferred = potentialMatches.filter(
          (m) => m.country && (user.preferredCountries as string[]).includes(m.country)
        );
        if (preferred.length > 0) potentialMatches = preferred;
      }

      // Score and rank — scores used for ordering only, not shown to users
      const { findOptimalMatches } = await import('./ai');
      const ranked = await findOptimalMatches(user, potentialMatches, 10);
      res.json(ranked);
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

      // Check if user already has an active match
      const existingMatch = await storage.getCurrentMatch(user.id);
      if (existingMatch && existingMatch.status === "accepted") {
        return res.status(400).json({ message: "You already have an active match" });
      }

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
        return res.json({ match, isMatched: true });
      }

      res.json({ match, isMatched: false });
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

      // Create match with rejected status
      const match = await storage.createMatch({
        userId: user.id,
        matchedUserId: userId,
        status: "rejected",
      });

      res.json({ success: true });
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

      // Check if user has subscription
      if (user.subscriptionTier === "none") {
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

      // Check if user has subscription
      if (user.subscriptionTier === "none") {
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

      res.json(message);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Subscription routes
  app.post("/api/subscription/subscribe", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }

      let tier, endDate;

      // Set subscription details based on the plan
      switch (planId) {
        case "basic":
          tier = "basic";
          // 1 month from now
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case "silver":
          tier = "silver";
          // 1 month from now
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case "diamond":
          tier = "diamond";
          // 1 month from now
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case "gold":
          tier = "gold";
          // 1 year from now
          endDate = new Date();
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
        default:
          return res.status(400).json({ message: "Invalid plan ID" });
      }

      // Create subscription
      const subscription = await storage.createSubscription({
        userId: user.id,
        tier,
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
        autoRenew: true,
        status: "active",
      });

      // Update user subscription
      await storage.updateUser(user.id, {
        subscriptionTier: tier,
        subscriptionExpiry: endDate.toISOString(),
      });

      res.json({ success: true, subscription });
    } catch (error) {
      console.error("Subscribe error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Wallet routes
  app.post("/api/wallet/deposit", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { amount } = req.body;

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      // Create transaction
      await storage.createTransaction({
        userId: user.id,
        amount,
        type: "deposit",
        status: "completed",
      });

      // Update user wallet
      const updatedUser = await storage.updateUser(user.id, {
        walletBalance: (parseFloat(user.walletBalance) || 0) + parseFloat(amount),
      });

      res.json({
        success: true,
        walletBalance: updatedUser.walletBalance,
      });
    } catch (error) {
      console.error("Deposit error:", error);
      res.status(500).json({ message: "Failed to deposit funds" });
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
        walletBalance: parseFloat(user.walletBalance) - parseFloat(amount),
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
        amount: platformFee,
        type: "fee",
        status: "completed",
      });

      // Update sender's wallet
      const updatedSender = await storage.updateUser(user.id, {
        walletBalance: parseFloat(user.walletBalance) - parseFloat(amount),
      });

      // Update recipient's wallet
      await storage.updateUser(recipientId, {
        walletBalance: (parseFloat(recipient.walletBalance) || 0) + giftAmount,
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

  // User routes
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);

      // Get user
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Remove sensitive information
      const { password, ...userData } = user;

      res.json(userData);
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

  // Admin route to add social media links (would be protected in a real app)
  app.post("/api/socials", async (req, res) => {
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
      const updated = await storage.updateUser(id, { isVerified: true } as any);
      res.json({ success: true, user: { id: updated.id, isVerified: updated.isVerified } });
    } catch (e: any) {
      console.error("Admin verify user error:", e);
      res.status(500).json({ message: "Failed to verify user" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}