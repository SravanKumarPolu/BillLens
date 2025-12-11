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

  // Create a circular pie chart visualization
  // Using View components with rotations to simulate pie segments
  const radius = size / 2 - 20;
  const centerX = size / 2;
  const centerY = size / 2;

  return (
    <View style={styles.chartContainer}>
      {/* Pie Chart Visualization */}
      <View style={[styles.pieContainer, { width: size, height: size }]}>
        <View style={[styles.pieCircle, { width: size, height: size }]}>
          {segments.map((segment, index) => {
            const color = segment.color || colorPalette[index % colorPalette.length];
            const endAngle = segment.startAngle + segment.angle;
            
            // Create pie segments using View with border radius and rotation
            // Each segment is a quarter circle rotated to the correct position
            return (
              <View
                key={index}
                style={[
                  styles.pieSegment,
                  {
                    width: radius * 2,
                    height: radius * 2,
                    borderRadius: radius,
                    borderWidth: radius * 0.4,
                    borderColor: color,
                    borderRightColor: 'transparent',
                    borderBottomColor: index === 0 ? color : 'transparent',
                    borderTopColor: 'transparent',
                    borderLeftColor: index === segments.length - 1 ? color : 'transparent',
                    transform: [
                      { rotate: `${segment.startAngle}deg` },
                      { translateX: centerX - radius },
                      { translateY: centerY - radius },
                    ],
                    position: 'absolute',
                    opacity: 0.85,
                  },
                ]}
              />
            );
          })}
          
          {/* Center circle to show total */}
          <View style={[styles.pieCenter, { 
            width: size * 0.5, 
            height: size * 0.5, 
            borderRadius: size * 0.25,
            backgroundColor: colors.surfaceCard,
            borderWidth: 3,
            borderColor: colors.borderSubtle,
            left: centerX - size * 0.25,
            top: centerY - size * 0.25,
          }]}>
            <Text style={[styles.pieCenterText, { color: colors.textPrimary }]}>
              Total
            </Text>
            <Text style={[styles.pieCenterAmount, { color: colors.textPrimary }]}>
              {formatMoney(total, false, currency)}
            </Text>
          </View>
        </View>
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
    position: 'relative',
  },
  pieCircle: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieSegment: {
    position: 'absolute',
  },
  pieCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pieCenterText: {
    ...typography.caption,
    ...typography.emphasis.medium,
    marginBottom: 2,
  },
  pieCenterAmount: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
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
  lineChartContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  lineChartInner: {
    position: 'relative',
  },
  yAxisContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  },
  gridLine: {
    position: 'absolute',
    height: 1,
  },
  yAxisLabel: {
    ...typography.caption,
    position: 'absolute',
    fontSize: 9,
    width: 35,
    textAlign: 'right',
  },
  chartArea: {
    position: 'absolute',
  },
  trendLineContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  trendLine: {
    position: 'absolute',
  },
  dataLineContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  dataLineSegment: {
    position: 'absolute',
    borderRadius: 1.5,
  },
  dataPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  dataPointLabel: {
    ...typography.caption,
    position: 'absolute',
    top: -18,
    left: -25,
    width: 50,
    textAlign: 'center',
    fontSize: 8,
  },
  xAxisContainer: {
    position: 'absolute',
    width: '100%',
    height: 30,
  },
  xAxisLabel: {
    ...typography.caption,
    position: 'absolute',
    fontSize: 9,
    width: 40,
    textAlign: 'center',
  },
});

interface LineChartProps {
  data: ChartDataPoint[];
  maxValue?: number;
  currency?: string;
  showValues?: boolean;
  height?: number;
  showTrendLine?: boolean;
}

/**
 * Line Chart Component for trend visualization
 */
export const LineChart: React.FC<LineChartProps> = ({
  data,
  maxValue,
  currency = 'INR',
  showValues = true,
  height = 200,
  showTrendLine = false,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const width = 300; // Chart width
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate points for the line
  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - min) / range) * chartHeight;
    return { x, y, ...point };
  });

  // Create path string for the line
  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  // Calculate trend line (simple linear regression)
  let trendPath = '';
  if (showTrendLine && points.length > 1) {
    const n = points.length;
    const sumX = points.reduce((sum, p, i) => sum + i, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p, i) => sum + i * p.y, 0);
    const sumX2 = points.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const trendStartY = intercept;
    const trendEndY = slope * (n - 1) + intercept;
    
    trendPath = `M ${points[0].x} ${trendStartY} L ${points[points.length - 1].x} ${trendEndY}`;
  }

  const colorPalette = [
    colors.primary,
    colors.accent,
    colors.accentAmber,
    colors.accentPink,
    '#8B5CF6',
    '#06B6D4',
  ];

  // Simplified line chart using View components
  // Calculate positions relative to chart area
  const chartAreaStyle = {
    width: chartWidth,
    height: chartHeight,
    position: 'relative' as const,
    backgroundColor: 'transparent',
  };

  return (
    <View style={styles.lineChartContainer}>
      <View style={[styles.lineChartInner, { width, height }]}>
        {/* Y-axis grid lines and labels */}
        <View style={styles.yAxisContainer}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const yPos = padding + chartHeight * (1 - ratio);
            const value = min + range * ratio;
            return (
              <React.Fragment key={i}>
                <View 
                  style={[
                    styles.gridLine,
                    { 
                      top: yPos,
                      left: padding,
                      width: chartWidth,
                      backgroundColor: colors.borderSubtle,
                    },
                  ]} 
                />
                {showValues && (
                  <Text 
                    style={[
                      styles.yAxisLabel,
                      { 
                        color: colors.textSecondary,
                        top: yPos - 8,
                        left: 0,
                      },
                    ]}
                  >
                    {formatMoney(value, false, currency)}
                  </Text>
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Chart area with lines and points */}
        <View style={[styles.chartArea, chartAreaStyle, { left: padding, top: padding }]}>
          {/* Trend line (simplified - shows direction) */}
          {showTrendLine && points.length > 1 && (
            <View style={styles.trendLineContainer}>
              <View
                style={[
                  styles.trendLine,
                  {
                    left: 0,
                    top: points[0].y - padding,
                    width: chartWidth,
                    height: 2,
                    backgroundColor: colors.accentAmber || colors.warning,
                    opacity: 0.5,
                    transform: [
                      {
                        rotate: `${Math.atan2(
                          (points[points.length - 1].y - points[0].y) / chartHeight,
                          chartWidth / chartWidth
                        ) * (180 / Math.PI)}deg`,
                      },
                    ],
                  },
                ]}
              />
            </View>
          )}

          {/* Data line connecting points */}
          {points.length > 1 && (
            <View style={styles.dataLineContainer}>
              {points.slice(0, -1).map((point, index) => {
                const nextPoint = points[index + 1];
                const dx = nextPoint.x - point.x;
                const dy = nextPoint.y - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                return (
                  <View
                    key={index}
                    style={[
                      styles.dataLineSegment,
                      {
                        left: point.x - padding,
                        top: point.y - padding,
                        width: distance,
                        height: 3,
                        backgroundColor: colors.primary,
                        transform: [{ rotate: `${angle}deg` }],
                        transformOrigin: '0% 50%',
                      },
                    ]}
                  />
                );
              })}
            </View>
          )}

          {/* Data points */}
          {points.map((point, index) => {
            const color = point.color || colorPalette[index % colorPalette.length];
            return (
              <View
                key={index}
                style={[
                  styles.dataPoint,
                  {
                    left: point.x - padding - 6,
                    top: point.y - padding - 6,
                    backgroundColor: color,
                    borderColor: colors.surfaceLight,
                  },
                ]}
              >
                {showValues && (index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 3) === 0) && (
                  <Text style={[styles.dataPointLabel, { color: colors.textPrimary }]}>
                    {formatMoney(point.value, false, currency)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* X-axis labels */}
        <View style={[styles.xAxisContainer, { top: height - padding + 10, left: padding }]}>
          {points.map((point, index) => (
            <Text
              key={index}
              style={[
                styles.xAxisLabel,
                { 
                  color: colors.textSecondary,
                  left: point.x - padding - 20,
                },
              ]}
            >
              {point.label.length > 6 ? point.label.substring(0, 6) : point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
};
