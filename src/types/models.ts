/**
 * Data models for BillLens
 */

export interface Member {
  id: string;
  name: string;
  email?: string;
  phone?: string; // For offline group support
  hasAccount?: boolean; // Whether member has BillLens account
  role?: 'admin' | 'member' | 'viewer'; // Group role (admin can manage group, settle on behalf)
  upiId?: string; // UPI ID for payments
}

export interface ExpensePayer {
  memberId: string;
  amount: number; // Amount this member paid
}

export interface ExtraItem {
  id: string;
  name: string;
  amount: number;
  paidBy?: string; // Optional: specific member who paid for this item
  splitBetween?: string[]; // Optional: specific members who share this item
}

export interface ExpenseSplit {
  memberId: string;
  amount: number; // Amount this member owes for this expense
}

export interface Expense {
  id: string;
  groupId: string; // 'personal' for personal expenses
  title: string;
  merchant?: string;
  amount: number; // Total amount
  currency: string; // Currency code (e.g., 'INR', 'USD', 'EUR')
  category: string;
  paidBy: string; // Member ID who paid (for backward compatibility)
  payers?: ExpensePayer[]; // Multiple payers support
  splits: ExpenseSplit[]; // How the expense is split
  extraItems?: ExtraItem[]; // Extra items or special case adjustments
  date: string; // ISO date string
  imageUri?: string;
  collectionId?: string; // Optional: ID of collection this expense belongs to
  // History tracking
  createdAt?: string; // When expense was created
  updatedAt?: string; // Last update timestamp
  editHistory?: ExpenseEdit[]; // Track all edits
  isPersonal?: boolean; // Flag to mark personal expenses
  isPriority?: boolean; // Priority bill flag for important expenses
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other'; // Payment method used
}

export interface ExpenseEdit {
  id: string;
  expenseId: string;
  editedAt: string; // ISO date string
  editedBy?: string; // Member ID who made the edit
  changes: {
    field: string; // 'amount' | 'merchant' | 'category' | 'splits' | 'paidBy'
    oldValue: any;
    newValue: any;
  }[];
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string; // Currency code for the settlement
  date: string; // ISO date string
  status: 'pending' | 'completed';
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other'; // Payment method used
  // Settlement-proof: Immutable history tracking (optional for backward compatibility)
  createdAt?: string; // When settlement was created (immutable)
  updatedAt?: string; // Last update (if any)
  version?: number; // Version number for conflict resolution
  previousVersionId?: string; // Link to previous version if modified
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  currency: string; // Default currency for the group (e.g., 'INR', 'USD', 'EUR')
  createdAt: string; // ISO date string
  adminId?: string; // Admin member ID (can manage group, settle on behalf)
  customCategories?: string[]; // Custom categories for this group
}

export interface GroupBalance {
  memberId: string;
  balance: number; // Positive = they owe you, Negative = you owe them
}

export interface GroupSummary {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  balances: GroupBalance[];
  summaryText: string; // e.g., "You owe ₹450" or "All settled"
}

export interface OcrHistory {
  id: string;
  groupId?: string;
  imageUri: string;
  timestamp: string; // ISO date string
  success: boolean;
  extractedData?: {
    amount?: string;
    merchant?: string;
    date?: string;
  };
  error?: string;
  expenseId?: string; // If OCR resulted in an expense
}

/**
 * Category Budget - Track spending limits per category
 */
export interface CategoryBudget {
  id: string;
  category: string;
  monthlyLimit: number;
  currency: string;
  groupId?: string; // If null, applies to personal expenses
  createdAt: string;
  updatedAt?: string;
}

/**
 * API Integration - Store integration settings
 */
export interface ApiIntegration {
  id: string;
  type: 'google_pay' | 'paytm' | 'phonepe' | 'sms' | 'email' | 'bank';
  enabled: boolean;
  settings: {
    [key: string]: any; // Provider-specific settings
  };
  lastSync?: string;
  createdAt: string;
}

/**
 * Group Collection - Combine multiple related bills under a single collection
 */
export interface GroupCollection {
  id: string;
  groupId: string;
  name: string;
  description?: string;
  expenseIds: string[]; // IDs of expenses in this collection
  createdAt: string;
  updatedAt?: string;
  createdBy?: string; // Member ID who created the collection
}

/**
 * Recurring Expense - Track subscriptions and recurring costs
 */
export interface RecurringExpense {
  id: string;
  groupId?: string; // If null, applies to personal expenses
  name: string;
  category: string;
  amount: number;
  currency: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string; // ISO date string
  endDate?: string; // Optional end date
  nextDueDate: string; // ISO date string
  isActive: boolean;
  reminderDaysBefore?: number; // Days before due date to remind
  createdAt: string;
  updatedAt?: string;
}
