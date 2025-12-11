/**
 * Pattern Learning Service
 * 
 * Learns from user behavior to provide smart automation:
 * - Remembers split patterns per category
 * - Suggests amounts based on history
 * - Learns category preferences
 */

import { Expense, Group } from '../types/models';

export interface SplitPattern {
  category: string;
  memberIds: string[]; // Who typically splits this category
  mode: 'equal' | 'custom';
  customAmounts?: Record<string, number>; // If custom, remember typical amounts
  frequency: number; // How many times this pattern was used
  lastUsed: string; // ISO date string
}

export interface AmountSuggestion {
  category: string;
  suggestedAmount: number;
  confidence: number; // 0-1
  basedOn: 'average' | 'last' | 'trend';
  history: number[]; // Last few amounts for this category
}

export interface CategoryLearning {
  merchantPattern: string; // Pattern or merchant name
  category: string;
  confidence: number;
  frequency: number;
}

/**
 * Learn split patterns from expenses
 */
export const learnSplitPatterns = (expenses: Expense[]): SplitPattern[] => {
  const patternMap = new Map<string, SplitPattern>();

  expenses.forEach(expense => {
    const category = expense.category || 'Other';
    const key = category;
    
    if (!expense.splits || expense.splits.length === 0) return;

    const existing = patternMap.get(key);
    const memberIds = expense.splits.map(s => s.memberId).sort();
    const splitAmounts = expense.splits.map(s => s.amount);
    const isEqual = splitAmounts.every(amt => Math.abs(amt - splitAmounts[0]) < 0.01);
    const mode: 'equal' | 'custom' = isEqual ? 'equal' : 'custom';

    if (existing) {
      // Check if this matches the existing pattern
      const memberIdsMatch = JSON.stringify(existing.memberIds.sort()) === JSON.stringify(memberIds);
      const modeMatch = existing.mode === mode;

      if (memberIdsMatch && modeMatch) {
        // Same pattern - increase frequency
        existing.frequency += 1;
        existing.lastUsed = expense.date;
        
        // Update custom amounts average if custom mode
        if (mode === 'custom' && expense.splits) {
          if (!existing.customAmounts) {
            existing.customAmounts = {};
          }
          expense.splits.forEach(split => {
            const current = existing.customAmounts![split.memberId] || 0;
            const count = existing.frequency;
            // Moving average
            existing.customAmounts![split.memberId] = (current * (count - 1) + split.amount) / count;
          });
        }
      } else {
        // Different pattern - create new or update if more frequent
        const newPattern: SplitPattern = {
          category,
          memberIds,
          mode,
          frequency: 1,
          lastUsed: expense.date,
        };
        
        if (mode === 'custom' && expense.splits) {
          newPattern.customAmounts = {};
          expense.splits.forEach(split => {
            newPattern.customAmounts![split.memberId] = split.amount;
          });
        }

        // Keep the more frequent pattern
        if (!existing || newPattern.frequency >= existing.frequency) {
          patternMap.set(key, newPattern);
        }
      }
    } else {
      // New pattern
      const newPattern: SplitPattern = {
        category,
        memberIds,
        mode,
        frequency: 1,
        lastUsed: expense.date,
      };

      if (mode === 'custom' && expense.splits) {
        newPattern.customAmounts = {};
        expense.splits.forEach(split => {
          newPattern.customAmounts![split.memberId] = split.amount;
        });
      }

      patternMap.set(key, newPattern);
    }
  });

  return Array.from(patternMap.values()).sort((a, b) => b.frequency - a.frequency);
};

/**
 * Get suggested split pattern for a category
 */
export const getSuggestedSplitPattern = (
  category: string,
  group: Group,
  patterns: SplitPattern[]
): {
  memberIds: string[];
  mode: 'equal' | 'custom';
  customAmounts?: Record<string, number>;
} | null => {
  const pattern = patterns.find(p => p.category === category);
  
  if (!pattern) {
    // Default: all members, equal split
    return {
      memberIds: group.members.map(m => m.id),
      mode: 'equal',
    };
  }

  // Check if pattern members still exist in group
  const validMemberIds = pattern.memberIds.filter(id => 
    group.members.some(m => m.id === id)
  );

  if (validMemberIds.length === 0) {
    // Pattern members no longer in group, use default
    return {
      memberIds: group.members.map(m => m.id),
      mode: 'equal',
    };
  }

  return {
    memberIds: validMemberIds,
    mode: pattern.mode,
    customAmounts: pattern.customAmounts,
  };
};

/**
 * Suggest amount for a category based on history
 */
export const suggestAmount = (
  category: string,
  expenses: Expense[]
): AmountSuggestion | null => {
  const categoryExpenses = expenses
    .filter(e => e.category === category)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (categoryExpenses.length === 0) return null;

  const amounts = categoryExpenses.map(e => e.amount);
  const lastAmount = amounts[0];
  const average = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

  // Calculate trend (comparing last 3 to previous 3)
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  let trendAmount = average;
  
  if (amounts.length >= 6) {
    const recent = amounts.slice(0, 3).reduce((sum, amt) => sum + amt, 0) / 3;
    const previous = amounts.slice(3, 6).reduce((sum, amt) => sum + amt, 0) / 3;
    
    if (recent > previous * 1.1) {
      trend = 'increasing';
      trendAmount = recent;
    } else if (recent < previous * 0.9) {
      trend = 'decreasing';
      trendAmount = recent;
    }
  }

  // Determine best suggestion
  let suggestedAmount: number;
  let basedOn: 'average' | 'last' | 'trend';
  let confidence: number;

  if (categoryExpenses.length >= 5 && trend !== 'stable') {
    // Use trend if we have enough data
    suggestedAmount = trendAmount;
    basedOn = 'trend';
    confidence = 0.8;
  } else if (categoryExpenses.length >= 3) {
    // Use average if we have some history
    suggestedAmount = average;
    basedOn = 'average';
    confidence = 0.7;
  } else {
    // Use last amount if limited history
    suggestedAmount = lastAmount;
    basedOn = 'last';
    confidence = 0.6;
  }

  return {
    category,
    suggestedAmount: Math.round(suggestedAmount * 100) / 100, // Round to 2 decimals
    confidence,
    basedOn,
    history: amounts.slice(0, 10), // Keep last 10 amounts
  };
};

/**
 * Learn category patterns from merchant names
 */
export const learnCategoryPatterns = (expenses: Expense[]): CategoryLearning[] => {
  const patternMap = new Map<string, { category: string; frequency: number }>();

  expenses.forEach(expense => {
    if (!expense.merchant) return;
    
    const merchantLower = expense.merchant.toLowerCase();
    const category = expense.category || 'Other';
    
    // Extract key words from merchant name
    const words = merchantLower.split(/\s+/).filter(w => w.length > 2);
    
    words.forEach(word => {
      const key = word;
      const existing = patternMap.get(key);
      
      if (existing) {
        if (existing.category === category) {
          existing.frequency += 1;
        } else {
          // Conflict - keep the more frequent category
          if (existing.frequency < 2) {
            patternMap.set(key, { category, frequency: 1 });
          }
        }
      } else {
        patternMap.set(key, { category, frequency: 1 });
      }
    });
  });

  return Array.from(patternMap.entries())
    .map(([merchantPattern, data]) => ({
      merchantPattern,
      category: data.category,
      confidence: Math.min(data.frequency / 3, 1), // Max confidence at 3+ occurrences
      frequency: data.frequency,
    }))
    .filter(p => p.frequency >= 2) // Only keep patterns seen at least twice
    .sort((a, b) => b.frequency - a.frequency);
};

/**
 * Suggest category for merchant name
 */
export const suggestCategory = (
  merchantName: string,
  patterns: CategoryLearning[]
): { category: string; confidence: number } | null => {
  if (!merchantName) return null;

  const merchantLower = merchantName.toLowerCase();
  const words = merchantLower.split(/\s+/).filter(w => w.length > 2);

  const matches: Array<{ category: string; confidence: number }> = [];

  // Check full merchant name first
  patterns.forEach(pattern => {
    if (merchantLower.includes(pattern.merchantPattern)) {
      matches.push({
        category: pattern.category,
        confidence: pattern.confidence,
      });
    }
  });

  // Check individual words
  words.forEach(word => {
    patterns.forEach(pattern => {
      if (pattern.merchantPattern === word) {
        matches.push({
          category: pattern.category,
          confidence: pattern.confidence * 0.8, // Lower confidence for word match
        });
      }
    });
  });

  if (matches.length === 0) return null;

  // Find most confident match
  const bestMatch = matches.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );

  return bestMatch;
};
