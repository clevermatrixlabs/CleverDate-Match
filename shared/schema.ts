import { pgTable, text, serial, integer, boolean, timestamp, decimal, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  gender: text("gender", { enum: ["male", "female"] }),
  religion: text("religion"),
  aboutMe: text("about_me"),
  interests: json("interests").$type<string[]>(),
  location: text("location"),
  age: integer("age"),
  isVerified: boolean("is_verified").default(false),
  profilePicture: text("profile_picture"),
  profileVideo: text("profile_video"),
  additionalPicture1: text("additional_picture_1"),
  additionalPicture2: text("additional_picture_2"),
  subscriptionTier: text("subscription_tier", { enum: ["none", "basic", "silver", "diamond", "gold"] }).default("none"),
  subscriptionExpiry: timestamp("subscription_expiry"),
  walletBalance: decimal("wallet_balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Verification table
export const verifications = pgTable("verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending"),
  verificationData: text("verification_data"),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Match table
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  matchedUserId: integer("matched_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Message table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").references(() => matches.id, { onDelete: "cascade" }).notNull(),
  senderId: integer("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Subscription table
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tier: text("tier", { enum: ["basic", "silver", "diamond", "gold"] }).notNull(),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date").notNull(),
  autoRenew: boolean("auto_renew").default(true),
  status: text("status", { enum: ["active", "cancelled", "expired"] }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction table
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type", { enum: ["deposit", "withdrawal", "gift", "fee"] }).notNull(),
  status: text("status", { enum: ["pending", "completed", "failed"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Social table
export const socials = pgTable("socials", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVerificationSchema = createInsertSchema(verifications).omit({
  id: true,
  createdAt: true,
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertSocialSchema = createInsertSchema(socials).omit({
  id: true,
  createdAt: true,
});

// Define types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Verification = typeof verifications.$inferSelect;
export type InsertVerification = z.infer<typeof insertVerificationSchema>;

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Social = typeof socials.$inferSelect;
export type InsertSocial = z.infer<typeof insertSocialSchema>;

// Auth related schemas
export const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;

// Profile schema
export const profileSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  gender: z.enum(["male", "female"]),
  religion: z.string().optional(),
  aboutMe: z.string().min(10, "Tell us a bit more about yourself").max(300, "Bio is too long"),
  age: z.number().min(18, "You must be at least 18 years old").max(100, "Age is invalid"),
  interests: z.array(z.string()).optional(),
  location: z.string().optional(),
});

export type ProfileForm = z.infer<typeof profileSchema>;