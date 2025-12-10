/**
 * Data models for BillLens
 */

export interface Member {
  id: string;
  name: string;
  email?: string;
}

export interface ExpenseSplit {
  memberId: string;
  amount: number; // Amount this member owes for this expense
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  merchant?: string;
  amount: number; // Total amount
  category: string;
  paidBy: string; // Member ID who paid
  splits: ExpenseSplit[]; // How the expense is split
  date: string; // ISO date string
  imageUri?: string;
  // History tracking
  createdAt?: string; // When expense was created
  updatedAt?: string; // Last update timestamp
  editHistory?: ExpenseEdit[]; // Track all edits
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
  date: string; // ISO date string
  status: 'pending' | 'completed';
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
  createdAt: string; // ISO date string
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

