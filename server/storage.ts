import { 
  User, InsertUser, 
  Verification, InsertVerification,
  Match, InsertMatch,
  Message, InsertMessage,
  Subscription, InsertSubscription,
  Transaction, InsertTransaction,
  Social, InsertSocial
} from "@shared/schema";
import * as schema from "@shared/schema";
import { db } from "./supabase";
import { eq, and, not, desc, or, sql } from "drizzle-orm";

// Interface with all required CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User>;
  
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
  
  // Social methods
  createSocial(social: InsertSocial): Promise<Social>;
  getSocials(): Promise<Social[]>;
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
      url: "https://instagram.com/timcleverdate",
      isActive: true
    });
    this.createSocial({
      platform: "twitter",
      url: "https://twitter.com/timcleverdate",
      isActive: true
    });
    this.createSocial({
      platform: "youtube",
      url: "https://youtube.com/c/timcleverdate",
      isActive: true
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
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
    
    // Find potential matches
    return Array.from(this.users.values()).filter(u => 
      u.id !== userId &&
      u.gender === oppositeGender &&
      u.isVerified === true &&
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
    return Array.from(this.socials.values())
      .filter(social => social.isActive === true);
  }
}

// Supabase/PostgreSQL database implementation
export class DrizzleStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return results[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) return undefined;
    const results = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return results[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db) throw new Error("Database not available");
    const now = new Date();
    const results = await db.insert(schema.users).values({
      ...insertUser,
      createdAt: now,
      updatedAt: now
    }).returning();
    return results[0];
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    if (!db) throw new Error("Database not available");
    const results = await db
      .update(schema.users)
      .set({ 
        ...userData,
        updatedAt: new Date() 
      })
      .where(eq(schema.users.id, id))
      .returning();
    return results[0];
  }
  
  // Verification methods
  async createVerification(verification: InsertVerification): Promise<Verification> {
    if (!db) throw new Error("Database not available");
    const results = await db.insert(schema.verifications).values({
      ...verification,
      createdAt: new Date()
    }).returning();
    return results[0];
  }

  async getVerification(id: number): Promise<Verification | undefined> {
    if (!db) return undefined;
    const results = await db.select().from(schema.verifications).where(eq(schema.verifications.id, id)).limit(1);
    return results[0];
  }

  async getVerificationByUserId(userId: number): Promise<Verification | undefined> {
    if (!db) return undefined;
    const results = await db
      .select()
      .from(schema.verifications)
      .where(eq(schema.verifications.userId, userId))
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1);
    return results[0];
  }
  
  // Match methods
  async createMatch(match: InsertMatch): Promise<Match> {
    if (!db) throw new Error("Database not available");
    const now = new Date();
    const results = await db.insert(schema.matches).values({
      ...match,
      createdAt: now,
      updatedAt: now
    }).returning();
    return results[0];
  }

  async getMatch(id: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await db.select().from(schema.matches).where(eq(schema.matches.id, id)).limit(1);
    return results[0];
  }

  async getCurrentMatch(userId: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await db
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
      .limit(1);
    return results[0];
  }

  async getMatchBetweenUsers(userId1: number, userId2: number): Promise<Match | undefined> {
    if (!db) return undefined;
    const results = await db
      .select()
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.userId, userId2),
          eq(schema.matches.matchedUserId, userId1),
          eq(schema.matches.status, "pending")
        )
      )
      .limit(1);
    return results[0];
  }

  async updateMatch(id: number, matchData: Partial<Match>): Promise<Match> {
    if (!db) throw new Error("Database not available");
    const results = await db
      .update(schema.matches)
      .set({ 
        ...matchData,
        updatedAt: new Date() 
      })
      .where(eq(schema.matches.id, id))
      .returning();
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
    const interactions = await db
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
      );
    
    const interactedUserIds = interactions.map(match => 
      match.userId === userId ? match.matchedUserId : match.userId
    );

    // Now find potential matches
    const results = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.gender, oppositeGender),
          eq(schema.users.isVerified, true),
          not(sql`${schema.users.id} = ANY(${JSON.stringify(interactedUserIds)})`)
        )
      )
      .limit(10);
    
    return results;
  }
  
  async getAllActiveMatches(): Promise<Match[]> {
    if (!db) return [];
    const results = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.status, "accepted"));
    return results;
  }
  
  // Message methods
  async createMessage(message: InsertMessage): Promise<Message> {
    if (!db) throw new Error("Database not available");
    const results = await db.insert(schema.messages).values({
      ...message,
      timestamp: new Date()
    }).returning();
    return results[0];
  }

  async getMessages(matchId: number): Promise<Message[]> {
    if (!db) return [];
    const results = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.matchId, matchId))
      .orderBy(schema.messages.timestamp);
    return results;
  }
  
  // Subscription methods
  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    if (!db) throw new Error("Database not available");
    const results = await db.insert(schema.subscriptions).values({
      ...subscription,
      createdAt: new Date()
    }).returning();
    return results[0];
  }

  async getSubscription(id: number): Promise<Subscription | undefined> {
    if (!db) return undefined;
    const results = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id.toString())).limit(1);
    return results[0];
  }

  async getUserSubscription(userId: number): Promise<Subscription | undefined> {
    if (!db) return undefined;
    const results = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "active")
        )
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);
    return results[0];
  }
  
  // Transaction methods
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    if (!db) throw new Error("Database not available");
    const results = await db.insert(schema.transactions).values({
      ...transaction,
      createdAt: new Date()
    }).returning();
    return results[0];
  }

  async getTransactions(userId: number): Promise<Transaction[]> {
    if (!db) return [];
    const results = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId))
      .orderBy(desc(schema.transactions.createdAt));
    return results;
  }
  
  // Social methods
  async createSocial(social: InsertSocial): Promise<Social> {
    if (!db) throw new Error("Database not available");
    const results = await db.insert(schema.socials).values({
      ...social,
      createdAt: new Date()
    }).returning();
    return results[0];
  }

  async getSocials(): Promise<Social[]> {
    if (!db) return [];
    const results = await db
      .select()
      .from(schema.socials)
      .where(eq(schema.socials.isActive, true));
    return results;
  }
}

// Choose the storage implementation based on database availability
let storage: IStorage;

if (db) {
  console.log("Using Supabase/PostgreSQL database for storage");
  storage = new DrizzleStorage();
  
  // Initialize socials if none exist - with improved error handling
  (async () => {
    try {
      // Add a delay before attempting to initialize socials
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const socials = await storage.getSocials();
      if (socials.length === 0) {
        try {
          await storage.createSocial({
            platform: "instagram",
            url: "https://instagram.com/timcleverdate",
            isActive: true
          });
          
          await storage.createSocial({
            platform: "twitter",
            url: "https://twitter.com/timcleverdate",
            isActive: true
          });
          
          await storage.createSocial({
            platform: "youtube",
            url: "https://youtube.com/c/timcleverdate",
            isActive: true
          });
          
          console.log("Social media links initialized");
        } catch (innerError) {
          console.warn("Could not create social links, will try again later:", innerError);
          // Non-critical error, application can continue
        }
      }
    } catch (error) {
      console.error("Error checking social links:", error);
      console.log("Social initialization deferred - app will continue");
    }
  })();
} else {
  console.log("Using in-memory storage (no database connection)");
  storage = new MemStorage();
}

export { storage };
