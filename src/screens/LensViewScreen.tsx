import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { LensView } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'LensView'>;

const LensViewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getGroupSummary, getGroup, calculateGroupBalances } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const summary = getGroupSummary(groupId);
  const group = getGroup(groupId);
  const balances = calculateGroupBalances(groupId);

  if (!summary || !group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Lens View</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Complete balance history for {group.name}
        </Text>
        </View>
      </View>

        <LensView
          group={group}
        balances={balances}
          expenses={summary.expenses}
          settlements={summary.settlements}
          currentUserId="you"
        />
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
    alignItems: 'flex-start',
  },
  backButton: {
    marginRight: 16,
    marginTop: 4,
  },
  backButtonText: {
    ...typography.body,
    fontSize: 16,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.loose,
  },
  errorText: {
    ...typography.bodyLarge,
    textAlign: 'center',
    marginTop: 100,
  },
});

export default LensViewScreen;
