import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import Card from './Card';
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

  // Show empty state if no insights at all
  if (!insights || insights.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Insights</Text>
        <Card style={styles.emptyStateCard}>
          <Text style={styles.emptyStateIcon}>💡</Text>
          <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>
            No insights yet
          </Text>
          <Text style={[styles.emptyStateMessage, { color: colors.textSecondary }]}>
            Insights will appear here as you add expenses and track your spending patterns.
          </Text>
        </Card>
      </View>
    );
  }

  // Filter to show only high/medium severity insights, limit to maxVisible
  const visibleInsights = insights
    .filter(insight => insight && insight.severity && (insight.severity !== 'low' || insights.length <= maxVisible))
    .slice(0, maxVisible);

  // Show empty state if no visible insights after filtering
  if (visibleInsights.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Insights</Text>
        <Card style={styles.emptyStateCard}>
          <Text style={styles.emptyStateIcon}>💡</Text>
          <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>
            No insights yet
          </Text>
          <Text style={[styles.emptyStateMessage, { color: colors.textSecondary }]}>
            Insights will appear here as you add expenses and track your spending patterns.
          </Text>
        </Card>
      </View>
    );
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
      <View style={styles.insightsList}>
        {visibleInsights.map((insight, index) => {
          // Ensure insight has all required properties
          if (!insight || !insight.title || !insight.message) {
            return null;
          }
          
          return (
        <Card
              key={`${insight.id || `insight-${index}`}-${index}`}
          style={[
            styles.insightCard,
                { borderLeftColor: getSeverityColor(insight.severity || 'low') },
          ]}
          onPress={insight.actionable && onInsightPress ? () => onInsightPress(insight) : undefined}
        >
          <View style={styles.insightHeader}>
                <Text style={styles.insightIcon}>{getTypeIcon(insight.type || 'info')}</Text>
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
          );
        })}
      </View>
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
    paddingHorizontal: 24,
  },
  title: {
    ...typography.h4,
    ...typography.emphasis.semibold,
    marginBottom: recommendedSpacing.comfortable,
    marginTop: recommendedSpacing.default,
  },
  insightsList: {
    gap: recommendedSpacing.default,
  },
  insightCard: {
    padding: 16,
    borderLeftWidth: 4,
    marginBottom: 0,
    backgroundColor: colors.surfaceCard,
    minHeight: 80, // Ensure cards have minimum height
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
  emptyStateCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    backgroundColor: colors.surfaceCard,
  },
  emptyStateIcon: {
    fontSize: 56,
    marginBottom: recommendedSpacing.comfortable,
  },
  emptyStateTitle: {
    ...typography.h4,
    ...typography.emphasis.semibold,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptyStateMessage: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
    maxWidth: '100%',
  },
});

export default memo(InsightsCard);
