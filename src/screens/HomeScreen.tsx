import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card, Button } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type GroupItem = {
  id: string;
  name: string;
  emoji: string;
  summary: string;
};

// Placeholder groups for UX; wire to state later.
const MOCK_GROUPS: GroupItem[] = [
  { id: '1', name: 'Our Home', emoji: '🏠', summary: 'You owe ₹450' },
  { id: '2', name: 'Us Two', emoji: '👫', summary: 'All settled' },
];

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const renderGroup = ({ item }: { item: GroupItem }) => (
    <Card
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
      style={styles.groupCard}
    >
      <View style={styles.groupContent}>
        <Text style={styles.groupEmoji}>{item.emoji}</Text>
        <View style={styles.groupTextWrapper}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupSummary}>{item.summary}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appName}>BillLens</Text>
        <TouchableOpacity>
          <Text style={styles.profile}>☁️</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your groups</Text>

      <FlatList
        data={MOCK_GROUPS}
        keyExtractor={item => item.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.groupsList}
      />

      <Button
        title="+ New group"
        onPress={() => navigation.navigate('CreateGroup')}
        variant="secondary"
        fullWidth={false}
        style={styles.newGroupButton}
      />

      <Button
        title="📷 Add from screenshot"
        onPress={() => navigation.navigate('CaptureOptions', {})}
        variant="primary"
        style={styles.fab}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  profile: {
    fontSize: 24,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  groupsList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  groupCard: {
    marginBottom: 10,
    padding: 14,
  },
  groupContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 26,
    marginRight: 10,
  },
  groupTextWrapper: {
    flex: 1,
  },
  groupName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  groupSummary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  newGroupButton: {
    marginHorizontal: 24,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
});

export default HomeScreen;
