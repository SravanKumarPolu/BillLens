import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card } from './Card';
import { Insight } from '../utils/insightsService';

export interface InsightsCardProps {
  insights: Insight[];
  onInsightPress?: (insight: Insight) => void;
  maxVisible?: number;
}

const InsightsCard: React.FC<InsightsCardProps> = ({
  insights,
  onInsightPress,
  maxVisible = 3,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  // Filter to show only high/medium severity insights, limit to maxVisible
  const visibleInsights = insights
    .filter(insight => insight.severity !== 'low' || insights.length <= maxVisible)
    .slice(0, maxVisible);

  if (visibleInsights.length === 0) {
    return null;
  }

  const getSeverityColor = (severity: Insight['severity']) => {
    switch (severity) {
      case 'high':
        return colors.error;
      case 'medium':
        return colors.accentAmber;
      case 'low':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  const getTypeIcon = (type: Insight['type']) => {
    switch (type) {
      case 'unfairness':
        return '⚖️';
      case 'mistake':
        return '⚠️';
      case 'suggestion':
        return '💡';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📌';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Insights</Text>
      {visibleInsights.map(insight => (
        <Card
          key={insight.id}
          style={[
            styles.insightCard,
            { borderLeftColor: getSeverityColor(insight.severity) },
          ]}
          onPress={insight.actionable && onInsightPress ? () => onInsightPress(insight) : undefined}
        >
          <View style={styles.insightHeader}>
            <Text style={styles.insightIcon}>{getTypeIcon(insight.type)}</Text>
            <View style={styles.insightContent}>
              <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>
                {insight.title}
              </Text>
              <Text style={[styles.insightMessage, { color: colors.textSecondary }]}>
                {insight.message}
              </Text>
            </View>
          </View>
          {insight.actionable && insight.actionLabel && (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.borderSubtle }]}
              onPress={() => onInsightPress?.(insight)}
            >
              <Text style={[styles.actionLabel, { color: colors.primary }]}>
                {insight.actionLabel}
              </Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}
      {insights.length > maxVisible && (
        <Text style={[styles.moreText, { color: colors.textSecondary }]}>
          +{insights.length - maxVisible} more insight{insights.length - maxVisible > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: recommendedSpacing.loose,
  },
  title: {
    ...typography.h4,
    marginBottom: recommendedSpacing.default,
  },
  insightCard: {
    marginBottom: recommendedSpacing.default,
    padding: 16,
    borderLeftWidth: 4,
  },
  insightHeader: {
    flexDirection: 'row',
    marginBottom: recommendedSpacing.default,
  },
  insightIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  insightMessage: {
    ...typography.body,
    lineHeight: 20,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: recommendedSpacing.tight,
  },
  actionLabel: {
    ...typography.buttonSmall,
  },
  moreText: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: recommendedSpacing.tight,
  },
});

export default memo(InsightsCard);
