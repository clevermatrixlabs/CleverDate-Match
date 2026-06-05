// User Types
export interface User {
  id: number;
  username?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'male' | 'female';
  religion?: string;
  aboutMe?: string;
  interests?: string[];
  location?: string;
  country?: string;
  age?: number;
  isVerified: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  profilePicture?: string;
  profileVideo?: string;
  additionalPicture1?: string;
  additionalPicture2?: string;
  subscriptionTier?: 'none' | 'basic' | 'silver' | 'diamond' | 'gold';
  subscriptionExpiry?: string;
  walletBalance?: number;
  intention?: 'marriage' | 'long-term' | 'getting-to-know';
  minAgePreference?: number;
  maxAgePreference?: number;
  preferredCountries?: string[];
  preferredReligion?: string;
}

export interface MatchCandidate extends User {
  compatibilityScore: number;
  compatibilityReason: string;
  sharedInterests: string[];
}

export interface InsertUser {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  religion?: string;
  aboutMe?: string;
  interests?: string[];
  location?: string;
  age?: number;
  isVerified: boolean;
  profilePicture?: string;
  profileVideo?: string;
  additionalPicture1?: string;
  additionalPicture2?: string;
  walletBalance: number;
}

// Match Types
export interface Match {
  id: number;
  userId: number;
  matchedUserId: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface InsertMatch {
  userId: number;
  matchedUserId: number;
  status: 'pending' | 'accepted' | 'rejected';
}

// Message Types
export interface Message {
  id: number;
  matchId: number;
  senderId: number;
  recipientId: number;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface InsertMessage {
  matchId: number;
  senderId: number;
  recipientId: number;
  content: string;
  isRead: boolean;
}

// Subscription Types
export interface Subscription {
  id: string;
  userId: number;
  tier: 'basic' | 'silver' | 'diamond' | 'gold';
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  status: 'active' | 'cancelled' | 'expired';
}

export interface InsertSubscription {
  userId: number;
  tier: 'basic' | 'silver' | 'diamond' | 'gold';
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  status: 'active' | 'cancelled' | 'expired';
}

// Transaction Types
export interface Transaction {
  id: number;
  userId: number;
  recipientId?: number;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'gift' | 'fee';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface InsertTransaction {
  userId: number;
  recipientId?: number;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'gift' | 'fee';
  status: 'pending' | 'completed' | 'failed';
}

// Verification Types
export interface Verification {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'rejected';
  verificationData?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

export interface InsertVerification {
  userId: number;
  status: 'pending' | 'approved' | 'rejected';
  verificationData?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

// Subscription Plan Types for UI
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  badge?: string;
  period: 'month' | 'year';
  features: string[];
  highlight?: boolean;
  ctaText: string;
}
