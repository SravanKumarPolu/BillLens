import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { formatMoney } from '../utils/formatMoney';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: ChartDataPoint[];
  total: number;
  size?: number;
  currency?: string;
}

/**
 * Simple Pie Chart Component
 * Uses View components to create a visual pie chart
 */
export const PieChart: React.FC<PieChartProps> = ({
  data,
  total,
  size = 200,
  currency = 'INR',
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  // Calculate angles for each segment
  const segments = data.map((point, index) => {
    const percentage = total > 0 ? (point.value / total) * 100 : 0;
    const angle = (point.value / total) * 360;
    const startAngle = data.slice(0, index).reduce((sum, p) => sum + (p.value / total) * 360, 0);
    
    return {
      ...point,
      percentage,
      angle,
      startAngle,
    };
  });

  // Generate colors if not provided
  const colorPalette = [
    colors.primary,
    colors.accent,
    colors.accentAmber,
    colors.accentPink,
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#84CC16', // Lime
  ];

  return (
    <View style={styles.chartContainer}>
      <View style={[styles.pieContainer, { width: size, height: size }]}>
        {/* Pie segments using View with border radius */}
        {segments.map((segment, index) => {
          const color = segment.color || colorPalette[index % colorPalette.length];
          // Simple visualization using rectangles with border radius
          // For a real pie chart, you'd need SVG or a library
          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  backgroundColor: color + '40',
                  width: `${segment.percentage}%`,
                  height: 8,
                  marginBottom: 4,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {segments.map((segment, index) => {
          const color = segment.color || colorPalette[index % colorPalette.length];
          return (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: color }]} />
              <View style={styles.legendTextContainer}>
                <Text style={[styles.legendLabel, { color: colors.textPrimary }]}>
                  {segment.label}
                </Text>
                <Text style={[styles.legendValue, { color: colors.textSecondary }]}>
                  {formatMoney(segment.value, false, currency)} ({segment.percentage.toFixed(0)}%)
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

interface BarChartProps {
  data: ChartDataPoint[];
  maxValue?: number;
  currency?: string;
  showValues?: boolean;
}

/**
 * Simple Bar Chart Component
 */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  maxValue,
  currency = 'INR',
  showValues = true,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  const colorPalette = [
    colors.primary,
    colors.accent,
    colors.accentAmber,
    colors.accentPink,
    '#8B5CF6',
    '#06B6D4',
  ];

  return (
    <View style={styles.barChartContainer}>
      {data.map((point, index) => {
        const percentage = max > 0 ? (point.value / max) * 100 : 0;
        const color = point.color || colorPalette[index % colorPalette.length];

        return (
          <View key={index} style={styles.barItem}>
            <View style={styles.barLabelRow}>
              <Text style={[styles.barLabel, { color: colors.textPrimary }]}>
                {point.label}
              </Text>
              {showValues && (
                <Text style={[styles.barValue, { color: colors.textSecondary }]}>
                  {formatMoney(point.value, false, currency)}
                </Text>
              )}
            </View>
            <View style={[styles.barContainer, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${percentage}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            {showValues && (
              <Text style={[styles.barPercentage, { color: colors.textSecondary }]}>
                {percentage.toFixed(0)}%
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  chartContainer: {
    marginVertical: 16,
  },
  pieContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  segment: {
    borderRadius: 4,
  },
  legend: {
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 12,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendLabel: {
    ...typography.body,
    marginBottom: 2,
  },
  legendValue: {
    ...typography.bodySmall,
  },
  barChartContainer: {
    gap: 16,
  },
  barItem: {
    marginBottom: 12,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  barLabel: {
    ...typography.body,
    flex: 1,
  },
  barValue: {
    ...typography.bodySmall,
    marginLeft: 8,
  },
  barContainer: {
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  bar: {
    height: '100%',
    borderRadius: 12,
  },
  barPercentage: {
    ...typography.caption,
    textAlign: 'right',
  },
});
