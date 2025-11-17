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
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string; // ISO date string
  status: 'pending' | 'completed';
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

