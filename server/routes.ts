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
  profileSchema,
  insertMatchSchema, 
  insertMessageSchema,
  insertTransactionSchema,
  insertVerificationSchema
} from "../shared/schema";
import { verify } from "./verification";
import * as fs from "fs";
import * as path from "path";
import { db } from "./supabase";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

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

  // Configure passport
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        // In a real app, you would compare hashed passwords
        if (user.password !== password) {
          return done(null, false, { message: "Invalid username or password" });
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

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      // In a real app, you would hash the password before storing it
      const newUser = await storage.createUser({
        username: validatedData.username,
        password: validatedData.password,
        walletBalance: 0,
        isVerified: false,
      });

      req.session.userId = newUser.id;
      
      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        isVerified: newUser.isVerified,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      passport.authenticate("local", (err: any, user: any, info: any) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.status(401).json({ message: info.message });
        }
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          return res.json({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            gender: user.gender,
            isVerified: user.isVerified,
            subscriptionTier: user.subscriptionTier,
          });
        });
      })(req, res, next);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
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

    res.json({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      religion: user.religion,
      aboutMe: user.aboutMe,
      interests: user.interests,
      location: user.location,
      age: user.age,
      isVerified: user.isVerified,
      profilePicture: user.profilePicture,
      profileVideo: user.profileVideo,
      additionalPicture1: user.additionalPicture1,
      additionalPicture2: user.additionalPicture2,
      subscriptionTier: user.subscriptionTier,
      subscriptionExpiry: user.subscriptionExpiry,
      walletBalance: user.walletBalance,
    });
  });

  // Verification route
  app.post("/api/verification", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { verificationData } = req.body;
      
      if (!verificationData) {
        return res.status(400).json({ message: "Verification data is required" });
      }

      // In a real app, this would call the AI verification service
      const verificationResult = await verify(verificationData);

      if (verificationResult.success) {
        // Create verification record
        await storage.createVerification({
          userId: user.id,
          status: "approved",
          verificationData,
          approvedAt: new Date().toISOString(),
        });

        // Update user verification status
        await storage.updateUser(user.id, { isVerified: true });

        return res.json({ success: true, message: "Verification successful" });
      } else {
        // Create verification record with rejected status
        await storage.createVerification({
          userId: user.id,
          status: "rejected",
          verificationData,
          rejectedReason: verificationResult.message,
        });

        return res.status(400).json({ success: false, message: verificationResult.message });
      }
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Profile routes
  app.post("/api/users/profile", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Parse form data
      const validatedData = profileSchema.parse({
        ...req.body,
        age: parseInt(req.body.age, 10),
      });

      // Handle file uploads (in a real app)
      // For this implementation, we'll assume the files are URLs
      const profilePicture = req.body.primaryPhoto || null;
      const profileVideo = req.body.profileVideo || null;
      const additionalPicture1 = req.body.additionalPhoto || null;

      // Update user profile
      await storage.updateUser(user.id, {
        ...validatedData,
        profilePicture,
        profileVideo,
        additionalPicture1,
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      console.error("Profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

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

  // Match routes
  app.get("/api/matches/potential", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Get potential matches
      const potentialMatches = await storage.getPotentialMatches(user.id, user.gender);
      
      res.json(potentialMatches);
    } catch (error) {
      console.error("Get potential matches error:", error);
      res.status(500).json({ message: "Failed to get potential matches" });
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
      // Get active social media links
      const socials = await storage.getSocials();
      
      res.json(socials);
    } catch (error) {
      console.error("Get socials error:", error);
      res.status(500).json({ message: "Failed to get social media links" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
