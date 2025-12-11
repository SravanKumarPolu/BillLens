import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Expense } from '../types/models';
import { formatMoney } from '../utils/formatMoney';
import Card from './Card';

interface CalendarViewProps {
  expenses: Expense[];
  onDatePress?: (date: string) => void;
  currency?: string;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  expenses,
  onDatePress,
  currency = 'INR',
}) => {
  const { colors } = useTheme();
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Group expenses by date
  const expensesByDate = useMemo(() => {
    const map = new Map<string, Expense[]>();
    
    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(expense);
    });

    return map;
  }, [expenses]);

  // Get calendar days for selected month
  const calendarDays = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<{
      date: Date;
      day: number;
      hasExpenses: boolean;
      expenseCount: number;
      totalAmount: number;
    }> = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({
        date: new Date(year, month, -i),
        day: 0,
        hasExpenses: false,
        expenseCount: 0,
        totalAmount: 0,
      });
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = date.toISOString().split('T')[0];
      const dayExpenses = expensesByDate.get(dateKey) || [];
      
      days.push({
        date,
        day,
        hasExpenses: dayExpenses.length > 0,
        expenseCount: dayExpenses.length,
        totalAmount: dayExpenses.reduce((sum, e) => sum + e.amount, 0),
      });
    }

    return days;
  }, [selectedMonth, expensesByDate]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedMonth);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedMonth(newDate);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Month Navigation */}
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={() => navigateMonth('prev')}
          style={styles.monthNavButton}
        >
          <Text style={[styles.monthNavText, { color: colors.primary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
          {monthNames[selectedMonth.getMonth()]} {selectedMonth.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => navigateMonth('next')}
          style={styles.monthNavButton}
        >
          <Text style={[styles.monthNavText, { color: colors.primary }]}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Week Day Headers */}
      <View style={styles.weekHeader}>
        {weekDays.map(day => (
          <View key={day} style={styles.weekDayHeader}>
            <Text style={[styles.weekDayText, { color: colors.textSecondary }]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((dayData, index) => {
          if (dayData.day === 0) {
            return <View key={index} style={styles.calendarDay} />;
          }

          const isToday = dayData.date.toDateString() === new Date().toDateString();
          const dateKey = dayData.date.toISOString().split('T')[0];

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.calendarDay,
                isToday && [styles.today, { borderColor: colors.primary }],
                dayData.hasExpenses && [styles.hasExpenses, { backgroundColor: colors.accent + '15' }],
              ]}
              onPress={() => {
                if (onDatePress && dayData.hasExpenses) {
                  onDatePress(dateKey);
                }
              }}
            >
              <Text
                style={[
                  styles.dayNumber,
                  { color: isToday ? colors.primary : colors.textPrimary },
                  dayData.hasExpenses && { fontWeight: '600' },
                ]}
              >
                {dayData.day}
              </Text>
              {dayData.hasExpenses && (
                <View style={styles.expenseIndicator}>
                  <View style={[styles.expenseDot, { backgroundColor: colors.accent }]} />
                  {dayData.expenseCount > 1 && (
                    <Text style={[styles.expenseCount, { color: colors.textSecondary }]}>
                      {dayData.expenseCount}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent + '15' }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Has expenses
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: colors.primary, borderWidth: 2 }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Today
          </Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  monthNavButton: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  monthNavText: {
    ...typography.h3,
  },
  monthTitle: {
    ...typography.h4,
    ...typography.emphasis.semibold,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    ...typography.caption,
    ...typography.emphasis.semibold,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%', // 7 days per week
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    position: 'relative',
  },
  today: {
    borderWidth: 2,
    borderRadius: 8,
  },
  hasExpenses: {
    borderRadius: 8,
  },
  dayNumber: {
    ...typography.bodySmall,
  },
  expenseIndicator: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
  },
  expenseDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  expenseCount: {
    ...typography.caption,
    fontSize: 8,
    marginTop: 1,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    ...typography.caption,
  },
});

export default CalendarView;
