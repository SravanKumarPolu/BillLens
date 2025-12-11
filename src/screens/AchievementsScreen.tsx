import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card } from '../components';
import {
  getBadges,
  getAchievements,
  calculateLevel,
  calculateStreak,
} from '../utils/gamificationService';

type Props = NativeStackScreenProps<RootStackParamList, 'Achievements'>;

const AchievementsScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const groupSummaries = getAllGroupSummaries() || [];
  const allExpenses = groupSummaries.flatMap(s => s.expenses);
  const allGroups = groupSummaries.map(s => s.group);

  const level = useMemo(() => calculateLevel(allExpenses), [allExpenses]);
  const streak = useMemo(() => calculateStreak(allExpenses), [allExpenses]);
  const badges = useMemo(() => getBadges(allExpenses, allGroups, streak), [allExpenses, allGroups, streak]);
  const achievements = useMemo(() => getAchievements(allExpenses, allGroups, streak, level), [allExpenses, allGroups, streak, level]);

  const unlockedBadges = badges.filter(b => b.unlocked);
  const lockedBadges = badges.filter(b => !b.unlocked);

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Achievements</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Level Card */}
        <Card style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <Text style={styles.levelIcon}>⭐</Text>
            <View style={styles.levelInfo}>
              <Text style={[styles.levelTitle, { color: colors.textPrimary }]}>
                Level {level.level} - {level.title}
              </Text>
              <Text style={[styles.levelXP, { color: colors.textSecondary }]}>
                {level.xp} XP • {level.xpToNextLevel} XP to next level
              </Text>
            </View>
          </View>
          <View style={[styles.xpBar, { backgroundColor: colors.borderSubtle }]}>
            <View
              style={[
                styles.xpBarFill,
                {
                  width: `${((level.xp - Math.pow(level.level - 1, 2) * 100) / (Math.pow(level.level, 2) * 100 - Math.pow(level.level - 1, 2) * 100)) * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </Card>

        {/* Streak Card */}
        <Card style={styles.streakCard}>
          <Text style={[styles.streakIcon]}>🔥</Text>
          <Text style={[styles.streakTitle, { color: colors.textPrimary }]}>Current Streak</Text>
          <Text style={[styles.streakValue, { color: colors.primary }]}>
            {streak.current} {streak.current === 1 ? 'day' : 'days'}
          </Text>
          <Text style={[styles.streakLongest, { color: colors.textSecondary }]}>
            Longest: {streak.longest} {streak.longest === 1 ? 'day' : 'days'}
          </Text>
        </Card>

        {/* Unlocked Badges */}
        {unlockedBadges.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Unlocked ({unlockedBadges.length}/{badges.length})
            </Text>
            <View style={styles.badgesGrid}>
              {unlockedBadges.map(badge => (
                <Card key={badge.id} style={styles.badgeCard}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={[styles.badgeName, { color: colors.textPrimary }]}>
                    {badge.name}
                  </Text>
                  <Text style={[styles.badgeDescription, { color: colors.textSecondary }]}>
                    {badge.description}
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        )}

        {/* Locked Badges */}
        {lockedBadges.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Locked ({lockedBadges.length})
            </Text>
            <View style={styles.badgesGrid}>
              {lockedBadges.map(badge => (
                <Card key={badge.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
                  <Text style={[styles.badgeIcon, { opacity: 0.3 }]}>{badge.icon}</Text>
                  <Text style={[styles.badgeName, { color: colors.textSecondary }]}>
                    {badge.name}
                  </Text>
                  <Text style={[styles.badgeDescription, { color: colors.textSecondary }]}>
                    {badge.description}
                  </Text>
                  <View style={[styles.progressBar, { backgroundColor: colors.borderSubtle }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${badge.progress}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    {Math.round(badge.progress)}% • {badge.target - Math.round((badge.progress / 100) * badge.target)} to go
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    ...typography.navigation,
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    minWidth: 60,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  levelCard: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: colors.primary + '10',
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  levelIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  levelInfo: {
    flex: 1,
  },
  levelTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  levelXP: {
    ...typography.bodySmall,
  },
  xpBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  streakCard: {
    marginBottom: 24,
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.accent + '10',
  },
  streakIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  streakTitle: {
    ...typography.body,
    marginBottom: 4,
  },
  streakValue: {
    ...typography.h1,
    marginBottom: 4,
  },
  streakLongest: {
    ...typography.bodySmall,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: 16,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: '48%',
    padding: 16,
    alignItems: 'center',
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  badgeName: {
    ...typography.h4,
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeDescription: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    ...typography.caption,
    textAlign: 'center',
  },
});

export default AchievementsScreen;
