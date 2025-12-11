/**
 * Export Service for BillLens
 * 
 * Provides functionality to export expense history, settlements, and ledger data
 * in various formats (JSON, CSV, PDF-ready text)
 */

import { Group, Expense, Settlement, GroupBalance, Member } from '../types/models';
import { formatMoney } from './formatMoney';
import { formatCurrency } from './currencyService';

export interface ExportOptions {
  format: 'json' | 'csv' | 'text' | 'pdf' | 'excel';
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
 * Export group history as PDF (HTML format ready for PDF conversion)
 * Requires: react-native-html-to-pdf or similar library
 */
export const exportAsPDF = (
  group: Group,
  expenses: Expense[],
  members: Member[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string => {
  const groupCurrency = group.currency || 'INR';
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Generate HTML content for PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #2563EB; }
    h2 { color: #1E40AF; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #E5E7EB; }
    th { background-color: #F3F4F6; font-weight: bold; }
    .summary { background-color: #F9FAFB; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .footer { margin-top: 32px; text-align: center; color: #6B7280; font-size: 12px; }
  </style>
</head>
<body>
  <h1>BillLens Expense Report</h1>
  <div class="summary">
    <p><strong>Group:</strong> ${group.name} ${group.emoji}</p>
    <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Total Expenses:</strong> ${expenses.length}</p>
    <p><strong>Total Amount:</strong> ${formatCurrency(totalAmount, groupCurrency)}</p>
  </div>

  <h2>Expenses</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Merchant</th>
        <th>Amount</th>
        <th>Category</th>
        <th>Paid By</th>
        <th>Split Between</th>
      </tr>
    </thead>
    <tbody>
      ${expenses.map(expense => {
        const date = new Date(expense.date).toLocaleDateString();
        const merchant = expense.merchant || expense.title || 'Unknown';
        const amount = formatCurrency(expense.amount, expense.currency || groupCurrency);
        const category = expense.category || 'Other';
        const paidByMember = members.find(m => {
          if (expense.payers && expense.payers.length > 0) {
            return expense.payers.some(p => p.memberId === m.id);
          }
          return m.id === expense.paidBy;
        });
        const paidBy = paidByMember?.name || expense.paidBy || 'Unknown';
        const splitMembers = expense.splits?.map(s => {
          const member = members.find(m => m.id === s.memberId);
          return member?.name || s.memberId;
        }).join(', ') || 'None';
        
        return `
          <tr>
            <td>${date}</td>
            <td>${merchant}</td>
            <td>${amount}</td>
            <td>${category}</td>
            <td>${paidBy}</td>
            <td>${splitMembers}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  ${settlements && settlements.length > 0 ? `
    <h2>Settlements</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${settlements.map(settlement => {
          const date = new Date(settlement.date).toLocaleDateString();
          const fromMember = members.find(m => m.id === settlement.fromMemberId);
          const toMember = members.find(m => m.id === settlement.toMemberId);
          const amount = formatCurrency(settlement.amount, settlement.currency || groupCurrency);
          
          return `
            <tr>
              <td>${date}</td>
              <td>${fromMember?.name || settlement.fromMemberId}</td>
              <td>${toMember?.name || settlement.toMemberId}</td>
              <td>${amount}</td>
              <td>${settlement.status}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  ` : ''}

  ${balances && balances.length > 0 ? `
    <h2>Current Balances</h2>
    <table>
      <thead>
        <tr>
          <th>Member</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${balances.map(balance => {
          const member = members.find(m => m.id === balance.memberId);
          const amount = formatCurrency(balance.balance, groupCurrency);
          const sign = balance.balance >= 0 ? '+' : '';
          
          return `
            <tr>
              <td>${member?.name || balance.memberId}</td>
              <td>${sign}${amount}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  ` : ''}

  <div class="footer">
    <p>Generated by BillLens - ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>
  `;
  
  return html;
};

/**
 * Export raw data as JSON (full data dump for backup)
 */
export const exportRawData = (
  groups: Group[],
  expenses: Expense[],
  settlements: Settlement[],
  ocrHistory?: any[],
  templateLastAmounts?: any[]
): string => {
  const rawData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    groups,
    expenses,
    settlements,
    ocrHistory: ocrHistory || [],
    templateLastAmounts: templateLastAmounts || [],
    metadata: {
      totalGroups: groups.length,
      totalExpenses: expenses.length,
      totalSettlements: settlements.length,
    },
  };

  return JSON.stringify(rawData, null, 2);
};

/**
 * Export as shareable dashboard summary
 */
export const exportDashboardSummary = (
  groups: Group[],
  expenses: Expense[],
  settlements: Settlement[]
): string => {
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalGroups = groups.length;
  const totalSettlements = settlements.length;
  const pendingSettlements = settlements.filter(s => s.status === 'pending').length;

  const categoryBreakdown: Record<string, number> = {};
  expenses.forEach(e => {
    const cat = e.category || 'Other';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + e.amount;
  });

  const summary = {
    overview: {
      totalSpent,
      totalGroups,
      totalExpenses: expenses.length,
      totalSettlements,
      pendingSettlements,
    },
    categoryBreakdown,
    groups: groups.map(g => ({
      name: g.name,
      emoji: g.emoji,
      memberCount: g.members.length,
      expenseCount: expenses.filter(e => e.groupId === g.id).length,
    })),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(summary, null, 2);
};

/**
 * Export group history as Excel (returns data structure ready for xlsx library)
 * Requires: xlsx library (e.g., react-native-xlsx or xlsx)
 */
export const exportAsExcel = (
  group: Group,
  expenses: Expense[],
  members: Member[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): any => {
  const groupCurrency = group.currency || 'INR';
  
  // Create workbook structure (compatible with xlsx library)
  const workbook: any = {
    SheetNames: [],
    Sheets: {},
  };

  // Expenses sheet
  const expensesData = [
    ['Date', 'Merchant', 'Amount', 'Currency', 'Category', 'Paid By', 'Split Between'],
    ...expenses.map(expense => {
      const date = new Date(expense.date).toLocaleDateString();
      const merchant = expense.merchant || expense.title || 'Unknown';
      const amount = expense.amount;
      const currency = expense.currency || groupCurrency;
      const category = expense.category || 'Other';
      const paidByMember = members.find(m => {
        if (expense.payers && expense.payers.length > 0) {
          return expense.payers.some(p => p.memberId === m.id);
        }
        return m.id === expense.paidBy;
      });
      const paidBy = paidByMember?.name || expense.paidBy || 'Unknown';
      const splitMembers = expense.splits?.map(s => {
        const member = members.find(m => m.id === s.memberId);
        return member?.name || s.memberId;
      }).join(', ') || 'None';
      
      return [date, merchant, amount, currency, category, paidBy, splitMembers];
    }),
  ];

  workbook.SheetNames.push('Expenses');
  workbook.Sheets['Expenses'] = arrayToSheet(expensesData);

  // Settlements sheet
  if (settlements && settlements.length > 0) {
    const settlementsData = [
      ['Date', 'From', 'To', 'Amount', 'Currency', 'Status'],
      ...settlements.map(settlement => {
        const date = new Date(settlement.date).toLocaleDateString();
        const fromMember = members.find(m => m.id === settlement.fromMemberId);
        const toMember = members.find(m => m.id === settlement.toMemberId);
        const amount = settlement.amount;
        const currency = settlement.currency || groupCurrency;
        
        return [
          date,
          fromMember?.name || settlement.fromMemberId,
          toMember?.name || settlement.toMemberId,
          amount,
          currency,
          settlement.status,
        ];
      }),
    ];

    workbook.SheetNames.push('Settlements');
    workbook.Sheets['Settlements'] = arrayToSheet(settlementsData);
  }

  // Balances sheet
  if (balances && balances.length > 0) {
    const balancesData = [
      ['Member', 'Balance'],
      ...balances.map(balance => {
        const member = members.find(m => m.id === balance.memberId);
        return [member?.name || balance.memberId, balance.balance];
      }),
    ];

    workbook.SheetNames.push('Balances');
    workbook.Sheets['Balances'] = arrayToSheet(balancesData);
  }

  return workbook;
};

/**
 * Helper function to convert array to Excel sheet format
 */
function arrayToSheet(data: any[][]): any {
  const sheet: any = {};
  const range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  
  for (let R = 0; R < data.length; R++) {
    for (let C = 0; C < data[R].length; C++) {
      if (range.s.r > R) range.s.r = R;
      if (range.s.c > C) range.s.c = C;
      if (range.e.r < R) range.e.r = R;
      if (range.e.c < C) range.e.c = C;
      
      const cell: any = { v: data[R][C] };
      const cellRef = getCellRef(R, C);
      
      if (R === 0) {
        // Header row - bold
        cell.s = { font: { bold: true } };
      }
      
      sheet[cellRef] = cell;
    }
  }
  
  sheet['!ref'] = getCellRef(range.s.r, range.s.c) + ':' + getCellRef(range.e.r, range.e.c);
  return sheet;
}

function getCellRef(row: number, col: number): string {
  const colLetter = String.fromCharCode(65 + col);
  return colLetter + (row + 1);
}

/**
 * Export group history with options
 */
export const exportGroupHistory = (
  group: Group,
  expenses: Expense[],
  options: ExportOptions,
  members: Member[],
  settlements?: Settlement[],
  balances?: GroupBalance[]
): string | any => {
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
    case 'pdf':
      return exportAsPDF(
        group,
        filteredExpenses,
        members,
        options.includeSettlements ? settlements : undefined,
        options.includeBalances ? balances : undefined
      );
    case 'excel':
      return exportAsExcel(
        group,
        filteredExpenses,
        members,
        options.includeSettlements ? settlements : undefined,
        options.includeBalances ? balances : undefined
      );
    default:
      return exportAsText(group, filteredExpenses, settlements, balances);
  }
};
