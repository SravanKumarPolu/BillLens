import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card } from './Card';
import { FairnessScore, ReliabilityMeter } from '../utils/fairnessScore';

export interface FairnessMeterProps {
  fairnessScore: FairnessScore;
  reliabilityMeter: ReliabilityMeter;
}

/**
 * Fairness Meter Component
 * Displays fairness score and reliability meter with visual indicators
 */
const FairnessMeter: React.FC<FairnessMeterProps> = ({
  fairnessScore,
  reliabilityMeter,
}) => {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const getScoreColor = (score: number) => {
    if (score >= 85) return colors.accent;
    if (score >= 70) return colors.accentAmber;
    if (score >= 50) return colors.error;
    return colors.error;
  };

  const getLevelEmoji = (level: string) => {
    switch (level) {
      case 'excellent':
      case 'high':
        return '✨';
      case 'good':
      case 'medium':
        return '✓';
      case 'fair':
        return '⚠️';
      case 'poor':
      case 'low':
        return '⚠️';
      case 'unfair':
        return '❌';
      default:
        return '•';
    }
  };

  return (
    <View style={styles.container}>
      {/* Fairness Score */}
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Fairness Score
          </Text>
          <Text style={styles.emoji}>{getLevelEmoji(fairnessScore.level)}</Text>
        </View>

        <View style={styles.scoreContainer}>
          <Text style={[
            styles.scoreValue,
            { color: getScoreColor(fairnessScore.score) }
          ]}>
            {fairnessScore.score}
          </Text>
          <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
            / 100
          </Text>
        </View>

        <Text style={[styles.levelText, { color: getScoreColor(fairnessScore.score) }]}>
          {fairnessScore.level.charAt(0).toUpperCase() + fairnessScore.level.slice(1)}
        </Text>

        {/* Score Breakdown */}
        <View style={styles.breakdown}>
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
              Payment Distribution
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${fairnessScore.factors.paymentDistribution}%`,
                    backgroundColor: getScoreColor(fairnessScore.factors.paymentDistribution),
                  },
                ]}
              />
            </View>
            <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
              {fairnessScore.factors.paymentDistribution}%
            </Text>
          </View>

          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
              Split Equality
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${fairnessScore.factors.splitEquality}%`,
                    backgroundColor: getScoreColor(fairnessScore.factors.splitEquality),
                  },
                ]}
              />
            </View>
            <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
              {fairnessScore.factors.splitEquality}%
            </Text>
          </View>

          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
              Balance Distribution
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${fairnessScore.factors.balanceDistribution}%`,
                    backgroundColor: getScoreColor(fairnessScore.factors.balanceDistribution),
                  },
                ]}
              />
            </View>
            <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
              {fairnessScore.factors.balanceDistribution}%
            </Text>
          </View>
        </View>

        {/* Recommendations */}
        {fairnessScore.recommendations.length > 0 && (
          <View style={styles.recommendations}>
            <Text style={[styles.recommendationsTitle, { color: colors.textPrimary }]}>
              Recommendations
            </Text>
            {fairnessScore.recommendations.map((rec, index) => (
              <Text key={index} style={[styles.recommendation, { color: colors.textSecondary }]}>
                • {rec}
              </Text>
            ))}
          </View>
        )}
      </Card>

      {/* Reliability Meter */}
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Reliability Meter
          </Text>
          <Text style={styles.emoji}>{getLevelEmoji(reliabilityMeter.level)}</Text>
        </View>

        <View style={styles.scoreContainer}>
          <Text style={[
            styles.scoreValue,
            { color: getScoreColor(reliabilityMeter.score) }
          ]}>
            {reliabilityMeter.score}
          </Text>
          <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
            / 100
          </Text>
        </View>

        <Text style={[styles.levelText, { color: getScoreColor(reliabilityMeter.score) }]}>
          {reliabilityMeter.level.charAt(0).toUpperCase() + reliabilityMeter.level.slice(1)} Reliability
        </Text>

        {/* Reliability Breakdown */}
        <View style={styles.breakdown}>
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
              Data Completeness
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${reliabilityMeter.factors.dataCompleteness}%`,
                    backgroundColor: getScoreColor(reliabilityMeter.factors.dataCompleteness),
                  },
                ]}
              />
            </View>
            <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
              {reliabilityMeter.factors.dataCompleteness}%
            </Text>
          </View>

          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
              Split Accuracy
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${reliabilityMeter.factors.splitAccuracy}%`,
                    backgroundColor: getScoreColor(reliabilityMeter.factors.splitAccuracy),
                  },
                ]}
              />
            </View>
            <Text style={[styles.breakdownValue, { color: colors.textPrimary }]}>
              {reliabilityMeter.factors.splitAccuracy}%
            </Text>
          </View>
        </View>

        {/* Warnings */}
        {reliabilityMeter.warnings.length > 0 && (
          <View style={styles.warnings}>
            {reliabilityMeter.warnings.map((warning, index) => (
              <Text key={index} style={[styles.warning, { color: colors.textSecondary }]}>
                {warning}
              </Text>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginBottom: recommendedSpacing.loose,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...typography.h4,
  },
  emoji: {
    fontSize: 24,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  scoreValue: {
    ...typography.moneyLarge,
    fontSize: 36,
  },
  scoreLabel: {
    ...typography.body,
    marginLeft: 4,
  },
  levelText: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 20,
  },
  breakdown: {
    marginBottom: 16,
  },
  breakdownItem: {
    marginBottom: 12,
  },
  breakdownLabel: {
    ...typography.bodySmall,
    marginBottom: 6,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownValue: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  recommendations: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  recommendationsTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 8,
  },
  recommendation: {
    ...typography.bodySmall,
    marginBottom: 4,
    lineHeight: 18,
  },
  warnings: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  warning: {
    ...typography.bodySmall,
    marginBottom: 4,
    lineHeight: 18,
  },
});

export default FairnessMeter;
