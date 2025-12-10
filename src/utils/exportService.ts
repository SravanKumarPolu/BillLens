/**
 * Export Service for BillLens
 * 
 * Provides functionality to export expense history, settlements, and ledger data
 * in various formats (JSON, CSV, PDF-ready text)
 */

import { Group, Expense, Settlement, GroupBalance } from '../types/models';
import { formatMoney } from './formatMoney';

export interface ExportOptions {
  format: 'json' | 'csv' | 'text';
  includeSettlements?: boolean;
  includeBalances?: boolean;
  dateRange?: {
    start: string; // ISO date string
    end: string;   // ISO date string
  };
}

export interface ExportData {
  group: Group;
  expenses: Expense[];
  settlements?: Settlement[];
  balances?: GroupBalance[];
  metadata: {
    exportedAt: string;
    totalExpenses: number;
    totalAmount: number;
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

/**
 * Export group history as JSON
 */
export const exportAsJSON = (
  group: Group,
  expenses: Expense[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string => {
  const exportData: ExportData = {
    group,
    expenses,
    settlements,
    balances,
    metadata: {
      exportedAt: new Date().toISOString(),
      totalExpenses: expenses.length,
      totalAmount: expenses.reduce((sum, e) => sum + e.amount, 0),
    },
  };

  return JSON.stringify(exportData, null, 2);
};

/**
 * Export group history as CSV
 */
export const exportAsCSV = (
  group: Group,
  expenses: Expense[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string => {
  const lines: string[] = [];
  
  // Header
  lines.push('BillLens Export');
  lines.push(`Group: ${group.name}`);
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push('');
  
  // Expenses section
  lines.push('EXPENSES');
  lines.push('Date,Merchant,Amount,Category,Paid By,Split With');
  
  expenses.forEach(expense => {
    const date = new Date(expense.date).toLocaleDateString();
    const merchant = expense.merchant || expense.title || 'Unknown';
    const amount = formatMoney(expense.amount);
    const category = expense.category || 'Other';
    const paidBy = expense.paidBy || 'Unknown';
    const splitWith = expense.splits?.map(s => s.memberId).join('; ') || 'None';
    
    lines.push(`"${date}","${merchant}",${amount},"${category}","${paidBy}","${splitWith}"`);
  });
  
  lines.push('');
  
  // Settlements section
  if (settlements && settlements.length > 0) {
    lines.push('SETTLEMENTS');
    lines.push('Date,From,To,Amount,Status');
    
    settlements.forEach(settlement => {
      const date = new Date(settlement.date).toLocaleDateString();
      const amount = formatMoney(settlement.amount);
      
      lines.push(`"${date}","${settlement.fromMemberId}","${settlement.toMemberId}",${amount},"${settlement.status}"`);
    });
    
    lines.push('');
  }
  
  // Balances section
  if (balances && balances.length > 0) {
    lines.push('CURRENT BALANCES');
    lines.push('Member,Balance');
    
    balances.forEach(balance => {
      const amount = formatMoney(balance.balance);
      lines.push(`"${balance.memberId}",${amount}`);
    });
  }
  
  return lines.join('\n');
};

/**
 * Export group history as human-readable text
 */
export const exportAsText = (
  group: Group,
  expenses: Expense[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string => {
  const lines: string[] = [];
  
  // Header
  lines.push('═══════════════════════════════════════');
  lines.push('  BILLLENS EXPENSE HISTORY');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`Group: ${group.name}`);
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Total Expenses: ${expenses.length}`);
  lines.push(`Total Amount: ${formatMoney(expenses.reduce((sum, e) => sum + e.amount, 0))}`);
  lines.push('');
  
  // Expenses section
  lines.push('───────────────────────────────────────');
  lines.push('EXPENSES');
  lines.push('───────────────────────────────────────');
  lines.push('');
  
  if (expenses.length === 0) {
    lines.push('No expenses recorded.');
  } else {
    expenses.forEach((expense, index) => {
      const date = new Date(expense.date).toLocaleDateString();
      const merchant = expense.merchant || expense.title || 'Unknown';
      const amount = formatMoney(expense.amount);
      const category = expense.category || 'Other';
      const paidBy = expense.paidBy || 'Unknown';
      
      lines.push(`${index + 1}. ${merchant}`);
      lines.push(`   Date: ${date}`);
      lines.push(`   Amount: ${amount}`);
      lines.push(`   Category: ${category}`);
      lines.push(`   Paid by: ${paidBy}`);
      
      if (expense.splits && expense.splits.length > 0) {
        const splitDetails = expense.splits
          .map(s => `${s.memberId}: ${formatMoney(s.amount)}`)
          .join(', ');
        lines.push(`   Split: ${splitDetails}`);
      }
      
      lines.push('');
    });
  }
  
  // Settlements section
  if (settlements && settlements.length > 0) {
    lines.push('───────────────────────────────────────');
    lines.push('SETTLEMENTS');
    lines.push('───────────────────────────────────────');
    lines.push('');
    
    settlements.forEach((settlement, index) => {
      const date = new Date(settlement.date).toLocaleDateString();
      const amount = formatMoney(settlement.amount);
      
      lines.push(`${index + 1}. ${settlement.fromMemberId} → ${settlement.toMemberId}`);
      lines.push(`   Amount: ${amount}`);
      lines.push(`   Date: ${date}`);
      lines.push(`   Status: ${settlement.status}`);
      lines.push('');
    });
  }
  
  // Balances section
  if (balances && balances.length > 0) {
    lines.push('───────────────────────────────────────');
    lines.push('CURRENT BALANCES');
    lines.push('───────────────────────────────────────');
    lines.push('');
    
    balances.forEach(balance => {
      const amount = formatMoney(balance.balance);
      const sign = balance.balance >= 0 ? '+' : '';
      lines.push(`${balance.memberId}: ${sign}${amount}`);
    });
    
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════');
  lines.push('End of Export');
  lines.push('═══════════════════════════════════════');
  
  return lines.join('\n');
};

/**
 * Export group history with options
 */
export const exportGroupHistory = (
  group: Group,
  expenses: Expense[],
  options: ExportOptions,
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string => {
  // Filter by date range if provided
  let filteredExpenses = expenses;
  if (options.dateRange) {
    filteredExpenses = expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      const start = new Date(options.dateRange!.start);
      const end = new Date(options.dateRange!.end);
      return expenseDate >= start && expenseDate <= end;
    });
  }
  
  switch (options.format) {
    case 'json':
      return exportAsJSON(
        group,
        filteredExpenses,
        options.includeSettlements ? settlements : undefined,
        options.includeBalances ? balances : undefined
      );
    case 'csv':
      return exportAsCSV(
        group,
        filteredExpenses,
        options.includeSettlements ? settlements : undefined,
        options.includeBalances ? balances : undefined
      );
    case 'text':
      return exportAsText(
        group,
        filteredExpenses,
        options.includeSettlements ? settlements : undefined,
        options.includeBalances ? balances : undefined
      );
    default:
      return exportAsText(group, filteredExpenses, settlements, balances);
  }
};
