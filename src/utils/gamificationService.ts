/**
 * Gamification Service
 * 
 * Provides badges, levels, streaks, and achievements:
 * - Badges for milestones
 * - Level system based on activity
 * - Streak tracking for daily adding
 * - Achievement unlocks
 */

import { Expense, Group } from '../types/models';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number; // 0-100
  target: number;
}

export interface UserLevel {
  level: number;
  xp: number;
  xpToNextLevel: number;
  title: string;
}

export interface Streak {
  current: number;
  longest: number;
  lastActivityDate: string;
}

export interface Achievement {
  id: string;
  type: 'badge' | 'level' | 'streak' | 'milestone';
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

/**
 * Calculate user level based on activity
 */
export const calculateLevel = (expenses: Expense[]): UserLevel => {
  // XP calculation: 10 XP per expense, 50 XP per settlement, 5 XP per group
  const expenseXP = expenses.length * 10;
  const groupXP = 0; // Would need groups count
  const totalXP = expenseXP + groupXP;

  // Level formula: level = floor(sqrt(totalXP / 100))
  const level = Math.floor(Math.sqrt(totalXP / 100)) + 1;
  const xpForCurrentLevel = Math.pow(level - 1, 2) * 100;
  const xpForNextLevel = Math.pow(level, 2) * 100;
  const xpToNextLevel = xpForNextLevel - totalXP;

  const titles = [
    'Beginner',
    'Tracker',
    'Organizer',
    'Pro',
    'Expert',
    'Master',
    'Legend',
  ];

  return {
    level: Math.min(level, 7),
    xp: totalXP,
    xpToNextLevel: Math.max(0, xpToNextLevel),
    title: titles[Math.min(level - 1, titles.length - 1)] || 'Master',
  };
};

/**
 * Calculate streak
 */
export const calculateStreak = (expenses: Expense[]): Streak => {
  if (expenses.length === 0) {
    return {
      current: 0,
      longest: 0,
      lastActivityDate: new Date().toISOString(),
    };
  }

  // Sort expenses by date
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const lastActivityDate = sortedExpenses[0].date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate current streak
  let currentStreak = 0;
  let checkDate = new Date(today);
  const expenseDates = new Set(
    sortedExpenses.map(e => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  while (expenseDates.has(checkDate.getTime())) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  sortedExpenses.reverse().forEach(expense => {
    const expenseDate = new Date(expense.date);
    expenseDate.setHours(0, 0, 0, 0);

    if (!prevDate) {
      tempStreak = 1;
      prevDate = expenseDate;
    } else {
      const daysDiff = Math.floor(
        (expenseDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 1) {
        tempStreak++;
      } else if (daysDiff > 1) {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
      prevDate = expenseDate;
    }
  });

  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current: currentStreak,
    longest: longestStreak,
    lastActivityDate,
  };
};

/**
 * Get all badges
 */
export const getBadges = (
  expenses: Expense[],
  groups: Group[],
  streak: Streak
): Badge[] => {
  const badges: Badge[] = [
    {
      id: 'first-expense',
      name: 'First Step',
      description: 'Added your first expense',
      icon: '🎯',
      unlocked: expenses.length >= 1,
      unlockedAt: expenses.length >= 1 ? expenses[0]?.date : undefined,
      progress: expenses.length >= 1 ? 100 : 0,
      target: 1,
    },
    {
      id: 'ten-expenses',
      name: 'Getting Started',
      description: 'Added 10 expenses',
      icon: '🔥',
      unlocked: expenses.length >= 10,
      unlockedAt:
        expenses.length >= 10
          ? expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[9]
              ?.date
          : undefined,
      progress: Math.min((expenses.length / 10) * 100, 100),
      target: 10,
    },
    {
      id: 'fifty-expenses',
      name: 'Regular Tracker',
      description: 'Added 50 expenses',
      icon: '⭐',
      unlocked: expenses.length >= 50,
      unlockedAt:
        expenses.length >= 50
          ? expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[49]
              ?.date
          : undefined,
      progress: Math.min((expenses.length / 50) * 100, 100),
      target: 50,
    },
    {
      id: 'hundred-expenses',
      name: 'Power User',
      description: 'Added 100 expenses',
      icon: '💎',
      unlocked: expenses.length >= 100,
      unlockedAt:
        expenses.length >= 100
          ? expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[99]
              ?.date
          : undefined,
      progress: Math.min((expenses.length / 100) * 100, 100),
      target: 100,
    },
    {
      id: 'balanced-spender',
      name: 'Balanced Spender',
      description: 'Maintained fair expense splitting',
      icon: '⚖️',
      unlocked: false, // Would need balance calculation
      progress: 0,
      target: 1,
    },
    {
      id: 'streak-7',
      name: 'Week Warrior',
      description: '7-day streak of adding expenses',
      icon: '🔥',
      unlocked: streak.current >= 7,
      progress: Math.min((streak.current / 7) * 100, 100),
      target: 7,
    },
    {
      id: 'streak-30',
      name: 'Monthly Master',
      description: '30-day streak of adding expenses',
      icon: '👑',
      unlocked: streak.current >= 30,
      progress: Math.min((streak.current / 30) * 100, 100),
      target: 30,
    },
    {
      id: 'multi-group',
      name: 'Group Organizer',
      description: 'Created 3 groups',
      icon: '🏠',
      unlocked: groups.length >= 3,
      progress: Math.min((groups.length / 3) * 100, 100),
      target: 3,
    },
  ];

  return badges;
};

/**
 * Get all achievements
 */
export const getAchievements = (
  expenses: Expense[],
  groups: Group[],
  streak: Streak,
  level: UserLevel
): Achievement[] => {
  const badges = getBadges(expenses, groups, streak);
  const achievements: Achievement[] = badges.map(badge => ({
    id: badge.id,
    type: 'badge' as const,
    title: badge.name,
    description: badge.description,
    icon: badge.icon,
    unlocked: badge.unlocked,
    unlockedAt: badge.unlockedAt,
  }));

  // Level achievements
  if (level.level >= 5) {
    achievements.push({
      id: 'level-5',
      type: 'level',
      title: 'Level 5 Reached',
      description: `You've reached level ${level.level}!`,
      icon: '⭐',
      unlocked: true,
    });
  }

  if (level.level >= 10) {
    achievements.push({
      id: 'level-10',
      type: 'level',
      title: 'Level 10 Master',
      description: `You've reached level ${level.level}!`,
      icon: '👑',
      unlocked: true,
    });
  }

  // Streak achievements
  if (streak.longest >= 7) {
    achievements.push({
      id: 'streak-7-longest',
      type: 'streak',
      title: 'Week Warrior',
      description: `Longest streak: ${streak.longest} days`,
      icon: '🔥',
      unlocked: true,
    });
  }

  if (streak.longest >= 30) {
    achievements.push({
      id: 'streak-30-longest',
      type: 'streak',
      title: 'Monthly Master',
      description: `Longest streak: ${streak.longest} days`,
      icon: '👑',
      unlocked: true,
    });
  }

  return achievements;
};
