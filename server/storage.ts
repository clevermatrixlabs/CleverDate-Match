import { 
  User, InsertUser, 
  Verification, InsertVerification,
  DeviceBan,
  Match, InsertMatch,
  Message, InsertMessage,
  Subscription, InsertSubscription,
  Transaction, InsertTransaction,
  Social, InsertSocial,
  Livestream, InsertLivestream,
} from "@shared/schema";
import * as schema from "@shared/schema";
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

// Module-level db reference — set by initStorage() after connection test
let db: any = null;

// Add retry functionality for database operations
async function withRetry(operation, maxRetries = 5, delay = 1000) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
      lastError = error;
      await setTimeoutPromise(delay * Math.pow(2, attempt));
    }
  }

  throw lastError;
}
import { eq, and, not, desc, or, sql, notInArray } from "drizzle-orm";

// Interface with all required CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  // Admin helpers
  listUsers(): Promise<User[]>;
  countUsers(): Promise<number>;
  countVerifiedUsers(): Promise<number>;
  countSuspendedUsers(): Promise<number>;
  countSubscribedUsers(): Promise<number>;
  countMatches(): Promise<number>;
  countMessages(): Promise<number>;

  // Verification methods
  createVerification(verification: InsertVerification): Promise<Verification>;
  getVerification(id: number): Promise<Verification | undefined>;
  getVerificationByUserId(userId: number): Promise<Verification | undefined>;

  // Match methods
  createMatch(match: InsertMatch): Promise<Match>;
  getMatch(id: number): Promise<Match | undefined>;
  getCurrentMatch(userId: number): Promise<Match | undefined>;
  getMatchBetweenUsers(userId1: number, userId2: number): Promise<Match | undefined>;
  updateMatch(id: number, matchData: Partial<Match>): Promise<Match>;
  getPotentialMatches(userId: number, gender: "male" | "female" | null): Promise<User[]>;
  getAllActiveMatches(): Promise<Match[]>;

  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getMessages(matchId: number): Promise<Message[]>;

  // Subscription methods
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  getSubscription(id: number): Promise<Subscription | undefined>;
  getUserSubscription(userId: number): Promise<Subscription | undefined>;

  // Transaction methods
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactions(userId: number): Promise<Transaction[]>;
  getTransactionByPaymentReference(paymentProvider: string, paymentReference: string): Promise<Transaction | undefined>;

  // Social methods
  createSocial(social: InsertSocial): Promise<Social>;
  getSocials(): Promise<Social[]>;
  getAllSocials(): Promise<Social[]>;
  deleteSocial(id: number): Promise<void>;
  toggleSocial(id: number, isActive: boolean): Promise<Social>;

  // Livestream methods
  createLivestream(data: InsertLivestream): Promise<Livestream>;
  getActiveLivestream(): Promise<Livestream | undefined>;
  getLivestream(id: number): Promise<Livestream | undefined>;
  endLivestream(id: number): Promise<void>;
  updateLivestreamStats(id: number, updates: Partial<Pick<Livestream, 'viewerCount' | 'likeCount' | 'totalGifts' | 'guestIds'>>): Promise<Livestream>;

  // Device ban methods
  isDeviceBanned(deviceId: string): Promise<boolean>;
  createDeviceBan(deviceId: string, reason: string, bannedByUserId?: number, ipAddress?: string): Promise<DeviceBan>;
  listDeviceBans(): Promise<DeviceBan[]>;
  removeDeviceBan(id: number): Promise<void>;

  // Admin verification review
  listVerificationsForReview(): Promise<any[]>;
  getAllVerifications(): Promise<any[]>;
}

// In-memory storage for testing and fallback
export class MemStorage implements IStorage {
  // Data storage
  private users: Map<number, User> = new Map();
  private verifications: Map<number, Verification> = new Map();
  private matches: Map<number, Match> = new Map();
  private messages: Map<number, Message> = new Map();
  private subscriptions: Map<number, Subscription> = new Map();
  private transactions: Map<number, Transaction> = new Map();
  private socials: Map<number, Social> = new Map();

  // ID counters
  private currentUserId = 1;
  private currentVerificationId = 1;
  private currentMatchId = 1;
  private currentMessageId = 1;
  private currentSubscriptionId = 1;
  private currentTransactionId = 1;
  private currentSocialId = 1;

  constructor() {
    // Initialize with some sample socials for the app owner
    this.createSocial({
      platform: "instagram",
      url: "https://instagram.com/cleverdatematch",
      isActive: true
    });
    this.createSocial({
      platform: "twitter",
      url: "https://twitter.com/cleverdatematch",
      isActive: true
    });
    this.createSocial({
      platform: "youtube",
      url: "https://youtube.com/c/cleverdatematch",
      isActive: true
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email?.toLowerCase() === email.toLowerCase());
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.phone === phone);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date().toISOString();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    // Remove all data linked to this user
    this.users.delete(id);
    for (const [k, v] of this.verifications) if (v.userId === id) this.verifications.delete(k);
    for (const [k, v] of this.matches) if ((v as any).userId1 === id || (v as any).userId2 === id) this.matches.delete(k);
    for (const [k, v] of this.messages) if (v.senderId === id) this.messages.delete(k);
    for (const [k, v] of this.subscriptions) if (v.userId === id) this.subscriptions.delete(k);
    for (const [k, v] of this.transactions) if (v.userId === id) this.transactions.delete(k);
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      throw new Error(`User with ID ${id} not found`);
    }

    const updatedUser = { 
      ...existingUser, 
      ...userData,
      updatedAt: new Date().toISOString()
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Admin helpers
  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values()).sort((a, b) =>
      new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()
    );
  }
  async countUsers(): Promise<number> { return this.users.size; }
  async countVerifiedUsers(): Promise<number> {
    return Array.from(this.users.values()).filter(u => u.isVerified).length;
  }
  async countSuspendedUsers(): Promise<number> {
    return Array.from(this.users.values()).filter(u => (u as any).isSuspended).length;
  }
  async countSubscribedUsers(): Promise<number> {
    return Array.from(this.users.values()).filter(u => u.subscriptionTier && u.subscriptionTier !== "none").length;
  }
  async countMatches(): Promise<number> { return this.matches.size; }
  async countMessages(): Promise<number> { return this.messages.size; }

  // Verification methods
  async createVerification(verification: InsertVerification): Promise<Verification> {
    const id = this.currentVerificationId++;
    const now = new Date().toISOString();
    const newVerification: Verification = {
      ...verification,
      id,
      createdAt: now
    };
    this.verifications.set(id, newVerification);
    return newVerification;
  }

  async getVerification(id: number): Promise<Verification | undefined> {
    return this.verifications.get(id);
  }

  async getVerificationByUserId(userId: number): Promise<Verification | undefined> {
    return Array.from(this.verifications.values())
      .filter(v => v.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  // Match methods
  async createMatch(match: InsertMatch): Promise<Match> {
    const id = this.currentMatchId++;
    const now = new Date().toISOString();
    const newMatch: Match = {
      ...match,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.matches.set(id, newMatch);
    return newMatch;
  }

  async getMatch(id: number): Promise<Match | undefined> {
    return this.matches.get(id);
  }

  async getCurrentMatch(userId: number): Promise<Match | undefined> {
    return Array.from(this.matches.values())
      .filter(m => 
        m.status === "accepted" && 
        (m.userId === userId || m.matchedUserId === userId)
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }

  async getMatchBetweenUsers(userId1: number, userId2: number): Promise<Match | undefined> {
    return Array.from(this.matches.values())
      .find(m => 
        m.userId === userId2 && 
        m.matchedUserId === userId1 &&
        m.status === "pending"
      );
  }

  async updateMatch(id: number, matchData: Partial<Match>): Promise<Match> {
    const existingMatch = this.matches.get(id);
    if (!existingMatch) {
      throw new Error(`Match with ID ${id} not found`);
    }

    const updatedMatch = { 
      ...existingMatch, 
      ...matchData,
      updatedAt: new Date().toISOString()
    };
    this.matches.set(id, updatedMatch);
    return updatedMatch;
  }

  async getPotentialMatches(userId: number, gender: "male" | "female" | null): Promise<User[]> {
    const user = await this.getUser(userId);
    if (!user || !user.gender) return [];

    const oppositeGender = user.gender === "male" ? "female" : "male";

    // Get IDs of users already interacted with
    const interactedUserIds = new Set<number>();
    for (const match of this.matches.values()) {
      if (match.userId === userId) {
        interactedUserIds.add(match.matchedUserId);
      } else if (match.matchedUserId === userId && match.status === "accepted") {
        interactedUserIds.add(match.userId);
      }
    }

    // Find potential matches — exclude admins, suspended, unverified, and already-seen users
    return Array.from(this.users.values()).filter(u => 
      u.id !== userId &&
      u.gender === oppositeGender &&
      u.isVerified === true &&
      !(u as any).isAdmin &&
      !(u as any).isSuspended &&
      !interactedUserIds.has(u.id)
    );
  }

  async getAllActiveMatches(): Promise<Match[]> {
    return Array.from(this.matches.values())
      .filter(match => match.status === "accepted");
  }

  // Message methods
  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const now = new Date().toISOString();
    const newMessage: Message = {
      ...message,
      id,
      timestamp: now
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async getMessages(matchId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.matchId === matchId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Subscription methods
  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const id = this.currentSubscriptionId++;
    const now = new Date().toISOString();
    const newSubscription: Subscription = {
      ...subscription,
      id: id.toString(), // Convert to string to match schema
      createdAt: now
    };
    this.subscriptions.set(id, newSubscription);
    return newSubscription;
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    return this.subscriptions.get(id);
  }

  async getUserSubscription(userId: number): Promise<Subscription | undefined> {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.userId === userId && sub.status === "active")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  // Transaction methods
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const now = new Date().toISOString();
    const newTransaction: Transaction = {
      ...transaction,
      id,
      createdAt: now
    };
    this.transactions.set(id, newTransaction);
    return newTransaction;
  }

  async getTransactions(userId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter(tx => tx.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getTransactionByPaymentReference(paymentProvider: string, paymentReference: string): Promise<Transaction | undefined> {
    return Array.from(this.transactions.values()).find(
      tx => tx.paymentProvider === paymentProvider && tx.paymentReference === paymentReference,
    );
  }

  // Social methods
  async createSocial(social: InsertSocial): Promise<Social> {
    const id = this.currentSocialId++;
    const now = new Date().toISOString();
    const newSocial: Social = {
      ...social,
      id,
      createdAt: now
    };
    this.socials.set(id, newSocial);
    return newSocial;
  }

  async getSocials(): Promise<Social[]> {
    return Array.from(this.socials.values()).filter(s => s.isActive === true);
  }

  async getAllSocials(): Promise<Social[]> {
    return Array.from(this.socials.values()).sort((a, b) => a.id - b.id);
  }

  async deleteSocial(id: number): Promise<void> {
    this.socials.delete(id);
  }

  async toggleSocial(id: number, isActive: boolean): Promise<Social> {
    const social = this.socials.get(id);
    if (!social) throw new Error("Social not found");
    const updated = { ...social, isActive };
    this.socials.set(id, updated);
    return updated;
  }

  // Livestream methods (in-memory)
  private livestreams: Map<number, Livestream> = new Map();
  private currentLivestreamId = 1;

  async createLivestream(data: InsertLivestream): Promise<Livestream> {
    const ls: Livestream = {
      id: this.currentLivestreamId++,
      hostId: data.hostId,
      title: data.title ?? "Live",
      status: "live",
      viewerCount: 0,
      likeCount: 0,
      totalGifts: "0",
      guestIds: [],
      startedAt: new Date(),
      endedAt: null,
    };
    this.livestreams.set(ls.id, ls);
    return ls;
  }

  async getActiveLivestream(): Promise<Livestream | undefined> {
    return Array.from(this.livestreams.values()).find(l => l.status === "live");
  }

  async getLivestream(id: number): Promise<Livestream | undefined> {
    return this.livestreams.get(id);
  }

  async endLivestream(id: number): Promise<void> {
    const ls = this.livestreams.get(id);
    if (ls) this.livestreams.set(id, { ...ls, status: "ended", endedAt: new Date() });
  }

  async updateLivestreamStats(id: number, updates: Partial<Pick<Livestream, 'viewerCount' | 'likeCount' | 'totalGifts' | 'guestIds'>>): Promise<Livestream> {
    const ls = this.livestreams.get(id);
    if (!ls) throw new Error("Livestream not found");
    const updated = { ...ls, ...updates };
    this.livestreams.set(id, updated);
    return updated;
  }

  // Device ban methods (in-memory)
  private deviceBans: Map<number, DeviceBan> = new Map();
  private currentDeviceBanId = 1;

  async isDeviceBanned(deviceId: string): Promise<boolean> {
    return Array.from(this.deviceBans.values()).some(b => b.deviceId === deviceId);
  }

  async createDeviceBan(deviceId: string, reason: string, bannedByUserId?: number, ipAddress?: string): Promise<DeviceBan> {
    const ban: DeviceBan = {
      id: this.currentDeviceBanId++,
      deviceId,
      reason: reason || null,
      bannedByUserId: bannedByUserId ?? null,
      ipAddress: ipAddress ?? null,
      bannedAt: new Date(),
    };
    this.deviceBans.set(ban.id, ban);
    return ban;
  }

  async listDeviceBans(): Promise<DeviceBan[]> {
    return Array.from(this.deviceBans.values()).sort((a, b) => b.id - a.id);
  }

  async removeDeviceBan(id: number): Promise<void> {
    this.deviceBans.delete(id);
  }

  async listVerificationsForReview(): Promise<any[]> {
    const vList = Array.from(this.verifications.values()).filter(v => v.status === 'pending_review' || v.status === 'pending');
    return vList.map(v => ({
      ...v,
      user: this.users.get(v.userId),
    }));
  }

  async getAllVerifications(): Promise<any[]> {
    const vList = Array.from(this.verifications.values());
    return vList.map(v => ({
      ...v,
      user: this.users.get(v.userId),
    }));
  }
}

// Supabase/PostgreSQL database implementation
export class DrizzleStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1));
    return results[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1));
    return results[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1));
    return results[0];
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1));
    return results[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db) throw new Error("Database not available");
    const now = new Date();
    const results = await withRetry(() => db.insert(schema.users).values({
      ...insertUser,
      createdAt: now,
      updatedAt: now
    }).returning());
    return results[0];
  }

  async deleteUser(id: number): Promise<void> {
    if (!db) throw new Error("Database not available");
    // Cascade delete all user data in the correct dependency order
    await withRetry(() => db.delete(schema.messages).where(eq(schema.messages.senderId, id)));
    await withRetry(() => db.delete(schema.matches).where(
      or(eq(schema.matches.userId1, id), eq(schema.matches.userId2, id))
    ));
    await withRetry(() => db.delete(schema.verifications).where(eq(schema.verifications.userId, id)));
    await withRetry(() => db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, id)));
    await withRetry(() => db.delete(schema.transactions).where(eq(schema.transactions.userId, id)));
    await withRetry(() => db.delete(schema.users).where(eq(schema.users.id, id)));
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    if (!db) throw new Error("Database not available");

    // Sanitize PostgreSQL array columns — if they arrive as a JSON string ("[]" / "[\"x\"]")
    // or as something other than a real JS array, normalise them so Drizzle sends the right
    // wire format and PostgreSQL doesn't throw "malformed array literal".
    const sanitized: any = { ...userData };
    for (const col of ["preferredCountries", "faceDescriptor", "interests"] as const) {
      if (col in sanitized) {
        const val = sanitized[col];
        if (typeof val === "string") {
          // e.g. "[]" or "[\"Tech\"]" — parse it back to an array
          try { sanitized[col] = JSON.parse(val); } catch { sanitized[col] = []; }
        }
        if (!Array.isArray(sanitized[col])) {
          sanitized[col] = [];
        }
        // For text[] columns an empty JS array is fine; Drizzle will send '{}'
      }
    }

    const results = await withRetry(() => db
      .update(schema.users)
      .set({ ...sanitized, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning());
    return results[0];
  }

  // Admin helpers
  async listUsers(): Promise<User[]> {
    if (!db) return [];
    return await withRetry(() => db.select().from(schema.users).orderBy(desc(schema.users.createdAt)));
  }
  async countUsers(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.users));
    return r[0]?.c ?? 0;
  }
  async countVerifiedUsers(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.isVerified, true)));
    return r[0]?.c ?? 0;
  }
  async countSuspendedUsers(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.isSuspended, true)));
    return r[0]?.c ?? 0;
  }
  async countSubscribedUsers(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.users).where(not(eq(schema.users.subscriptionTier, "none"))));
    return r[0]?.c ?? 0;
  }
  async countMatches(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.matches));
    return r[0]?.c ?? 0;
  }
  async countMessages(): Promise<number> {
    if (!db) return 0;
    const r = await withRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(schema.messages));
    return r[0]?.c ?? 0;
  }

  // Verification methods
  async createVerification(verification: InsertVerification): Promise<Verification> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.verifications).values({
      ...verification,
      createdAt: new Date()
    }).returning());
    return results[0];
  }

  async getVerification(id: number): Promise<Verification | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.verifications).where(eq(schema.verifications.id, id)).limit(1));
    return results[0];
  }

  async getVerificationByUserId(userId: number): Promise<Verification | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db
      .select()
      .from(schema.verifications)
      .where(eq(schema.verifications.userId, userId))
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1));
    return results[0];
  }

  // Match methods
  async createMatch(match: InsertMatch): Promise<Match> {
    if (!db) throw new Error("Database not available");
    const now = new Date();
    const results = await withRetry(() => db.insert(schema.matches).values({
      ...match,
      createdAt: now,
      updatedAt: now
    }).returning());
    return results[0];
  }

  async getMatch(id: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1));
    return results[0];
  }

  async getCurrentMatch(userId: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db
      .select()
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.status, "accepted"),
          or(
            eq(schema.matches.userId, userId),
            eq(schema.matches.matchedUserId, userId)
          )
        )
      )
      .orderBy(desc(schema.matches.updatedAt))
      .limit(1));
    return results[0];
  }

  async getMatchBetweenUsers(userId1: number, userId2: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db
      .select()
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.userId, userId2),
          eq(schema.matches.matchedUserId, userId1),
          eq(schema.matches.status, "pending")
        )
      )
      .limit(1));
    return results[0];
  }

  async updateMatch(id: number, matchData: Partial<Match>): Promise<Match> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db
      .update(schema.matches)
      .set({ 
        ...matchData,
        updatedAt: new Date() 
      })
      .where(eq(schema.matches.id, id))
      .returning());
    return results[0];
  }

  async getPotentialMatches(userId: number, gender: "male" | "female" | null): Promise<User[]> {
    if (!db) return [];

    // Get the user to find out their gender
    const user = await this.getUser(userId);
    if (!user || !user.gender) return [];

    // Find opposite gender users who are verified
    const oppositeGender = user.gender === "male" ? "female" : "male";

    // Get all the users this user has interacted with
    const interactions = await withRetry(() => db
      .select()
      .from(schema.matches)
      .where(
        or(
          eq(schema.matches.userId, userId),
          and(
            eq(schema.matches.matchedUserId, userId),
            eq(schema.matches.status, "accepted")
          )
        )
      ));

    const interactedUserIds = interactions.map(match => 
      match.userId === userId ? match.matchedUserId : match.userId
    );

    // Now find potential matches — exclude admins and suspended users
    const baseConditions = and(
      eq(schema.users.gender, oppositeGender),
      eq(schema.users.isVerified, true),
      eq(schema.users.isAdmin, false),
      eq(schema.users.isSuspended, false),
      // Only add exclusion when there are IDs to exclude — passing [] to notInArray
      // or JSON.stringify([]) to raw SQL both crash PostgreSQL
      ...(interactedUserIds.length > 0 ? [notInArray(schema.users.id, interactedUserIds)] : [])
    );

    const results = await withRetry(() => db
      .select()
      .from(schema.users)
      .where(baseConditions)
      .limit(10));

    return results;
  }

  async getAllActiveMatches(): Promise<Match[]> {
    if (!db) return [];
    const results = await withRetry(() => db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.status, "accepted")));
    return results;
  }

  // Message methods
  async createMessage(message: InsertMessage): Promise<Message> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.messages).values({
      ...message,
      timestamp: new Date()
    }).returning());
    return results[0];
  }

  async getMessages(matchId: number): Promise<Message[]> {
    if (!db) return [];
    const results = await withRetry(() => db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.matchId, matchId))
      .orderBy(schema.messages.timestamp));
    return results;
  }

  // Subscription methods
  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.subscriptions).values({
      ...subscription,
      createdAt: new Date()
    }).returning());
    return results[0];
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id.toString())).limit(1));
    return results[0];
  }

  async getUserSubscription(userId: number): Promise<Subscription | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "active")
        )
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1));
    return results[0];
  }

  // Transaction methods
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.transactions).values({
      ...transaction,
      createdAt: new Date()
    }).returning());
    return results[0];
  }

  async getTransactions(userId: number): Promise<Transaction[]> {
    if (!db) return [];
    const results = await withRetry(() => db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId))
      .orderBy(desc(schema.transactions.createdAt)));
    return results;
  }

  async getTransactionByPaymentReference(paymentProvider: string, paymentReference: string): Promise<Transaction | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() => db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.paymentProvider, paymentProvider),
          eq(schema.transactions.paymentReference, paymentReference),
        ),
      )
      .limit(1));
    return results[0];
  }

  // Social methods
  async createSocial(social: InsertSocial): Promise<Social> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.socials).values({
      ...social,
      createdAt: new Date()
    }).returning());
    return results[0];
  }

  async getSocials(): Promise<Social[]> {
    if (!db) return [];
    const results = await withRetry(() => db.select().from(schema.socials).where(eq(schema.socials.isActive, true)));
    return results;
  }

  async getAllSocials(): Promise<Social[]> {
    if (!db) return [];
    return withRetry(() => db.select().from(schema.socials).orderBy(schema.socials.id));
  }

  async deleteSocial(id: number): Promise<void> {
    if (!db) throw new Error("Database not available");
    await withRetry(() => db.delete(schema.socials).where(eq(schema.socials.id, id)));
  }

  async toggleSocial(id: number, isActive: boolean): Promise<Social> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() =>
      db.update(schema.socials).set({ isActive }).where(eq(schema.socials.id, id)).returning()
    );
    if (!results[0]) throw new Error("Social not found");
    return results[0];
  }

  // Livestream methods (Drizzle)
  async createLivestream(data: InsertLivestream): Promise<Livestream> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() =>
      db.insert(schema.livestreams).values({ ...data, startedAt: new Date() }).returning()
    );
    return results[0];
  }

  async getActiveLivestream(): Promise<Livestream | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() =>
      db.select().from(schema.livestreams).where(eq(schema.livestreams.status, "live")).limit(1)
    );
    return results[0];
  }

  async getLivestream(id: number): Promise<Livestream | undefined> {
    if (!db) return undefined;
    const results = await withRetry(() =>
      db.select().from(schema.livestreams).where(eq(schema.livestreams.id, id)).limit(1)
    );
    return results[0];
  }

  async endLivestream(id: number): Promise<void> {
    if (!db) throw new Error("Database not available");
    await withRetry(() =>
      db.update(schema.livestreams).set({ status: "ended", endedAt: new Date() }).where(eq(schema.livestreams.id, id))
    );
  }

  async updateLivestreamStats(id: number, updates: Partial<Pick<Livestream, 'viewerCount' | 'likeCount' | 'totalGifts' | 'guestIds'>>): Promise<Livestream> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() =>
      db.update(schema.livestreams).set(updates).where(eq(schema.livestreams.id, id)).returning()
    );
    return results[0];
  }

  // ── Device ban methods (Drizzle) ────────────────────────────────────────────
  async isDeviceBanned(deviceId: string): Promise<boolean> {
    if (!db) return false;
    const r = await withRetry(() => db.select().from(schema.deviceBans).where(eq(schema.deviceBans.deviceId, deviceId)).limit(1));
    return r.length > 0;
  }

  async createDeviceBan(deviceId: string, reason: string, bannedByUserId?: number, ipAddress?: string): Promise<DeviceBan> {
    if (!db) throw new Error("Database not available");
    const results = await withRetry(() => db.insert(schema.deviceBans).values({
      deviceId,
      reason: reason || null,
      bannedByUserId: bannedByUserId ?? null,
      ipAddress: ipAddress ?? null,
      bannedAt: new Date(),
    }).returning());
    return results[0];
  }

  async listDeviceBans(): Promise<DeviceBan[]> {
    if (!db) return [];
    return await withRetry(() => db.select().from(schema.deviceBans).orderBy(desc(schema.deviceBans.bannedAt)));
  }

  async removeDeviceBan(id: number): Promise<void> {
    if (!db) throw new Error("Database not available");
    await withRetry(() => db.delete(schema.deviceBans).where(eq(schema.deviceBans.id, id)));
  }

  async listVerificationsForReview(): Promise<any[]> {
    if (!db) return [];
    const rows = await withRetry(() =>
      db.select().from(schema.verifications)
        .where(or(eq(schema.verifications.status, 'pending_review'), eq(schema.verifications.status, 'pending')))
        .orderBy(desc(schema.verifications.createdAt))
    );
    const enriched = await Promise.all(rows.map(async (v: any) => {
      const user = await this.getUser(v.userId);
      return { ...v, user };
    }));
    return enriched;
  }

  async getAllVerifications(): Promise<any[]> {
    if (!db) return [];
    const rows = await withRetry(() =>
      db.select().from(schema.verifications).orderBy(desc(schema.verifications.createdAt))
    );
    const enriched = await Promise.all(rows.map(async (v: any) => {
      const user = await this.getUser(v.userId);
      return { ...v, user };
    }));
    return enriched;
  }
}

// Start with in-memory storage — upgraded to DB storage after initStorage() completes
export let storage: IStorage = new MemStorage();

export async function initStorage(): Promise<void> {
  try {
    const { dbReady } = await import('./supabase');
    await dbReady;
    // Re-import to get the updated db value after the promise resolves
    const supabase = await import('./supabase');
    if (supabase.db) {
      db = supabase.db; // set module-level db for DrizzleStorage methods
      console.log("Using PostgreSQL database for storage");
      storage = new DrizzleStorage();

      // Initialize default social links silently
      try {
        const socials = await storage.getSocials();
        if (socials.length === 0) {
          await storage.createSocial({ platform: "instagram", url: "https://instagram.com/cleverdatematch", isActive: true });
          await storage.createSocial({ platform: "twitter", url: "https://twitter.com/cleverdatematch", isActive: true });
          await storage.createSocial({ platform: "youtube", url: "https://youtube.com/c/cleverdatematch", isActive: true });
          console.log("Social media links initialized");
        }
      } catch (e) {
        console.warn("Could not initialize social links:", e);
      }
    } else {
      console.log("Using in-memory storage (no database connection)");
    }
  } catch (e) {
    console.warn("Storage initialization failed, using in-memory storage:", e);
  }
}