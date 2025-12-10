import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Card, Button } from '../components';
import { useGroups } from '../context/GroupsContext';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { getAllGroupSummaries } = useGroups();
  const { user, syncData, isSyncing, lastSyncDate } = useAuth();
  const { colors } = useTheme();
  const groupSummaries = getAllGroupSummaries() || [];

  const handleProfilePress = () => {
    if (user) {
      // Show sync menu or profile
      navigation.navigate('BackupRestore');
    } else {
      // Show login option
      navigation.navigate('Login');
    }
  };

  const handleSync = async () => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    
    try {
      await syncData();
    } catch (error) {
      // Error handling in syncData
    }
  };

  const styles = createStyles(colors);

  const renderGroup = ({ item }: { item: typeof groupSummaries[0] }) => (
    <Card
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.group.id })}
      style={styles.groupCard}
      elevated
    >
      <View style={styles.groupContent}>
        <Text style={styles.groupEmoji}>{item.group.emoji}</Text>
        <View style={styles.groupTextWrapper}>
          <Text style={[styles.groupName, { color: colors.textPrimary }]}>{item.group.name}</Text>
          <Text style={[styles.groupSummary, { color: colors.textSecondary }]}>{item.summaryText}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>BillLens</Text>
        <TouchableOpacity 
          onPress={handleProfilePress}
          style={styles.profileButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.profile}>
            {user ? (isSyncing ? '🔄' : '☁️') : '☁️'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Your groups</Text>

      {groupSummaries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏠</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No groups yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create your first group to start splitting expenses
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupSummaries}
          keyExtractor={item => item.group.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.groupsList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {groupSummaries.length > 0 && (
        <Button
          title="+ New group"
          onPress={() => navigation.navigate('CreateGroup')}
          variant="secondary"
          fullWidth={false}
          style={styles.newGroupButton}
        />
      )}

      <Button
        title="📷 Add from screenshot"
        onPress={() => navigation.navigate('CaptureOptions', {})}
        variant="primary"
        style={styles.fab}
      />
    </View>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: recommendedSpacing.loose,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    ...typography.display,
  },
  profileButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profile: {
    fontSize: 24, // Emoji icon, not typography
  },
  sectionTitle: {
    ...typography.label,
    paddingHorizontal: 24,
    marginBottom: recommendedSpacing.comfortable,
    fontWeight: '600',
  },
  groupsList: {
    paddingHorizontal: 24,
    paddingBottom: 140,
    paddingTop: recommendedSpacing.default,
  },
  groupCard: {
    marginBottom: recommendedSpacing.comfortable,
    padding: recommendedSpacing.loose,
  },
  groupContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupEmoji: {
    fontSize: 32, // Emoji icon, not typography
    marginRight: recommendedSpacing.comfortable,
  },
  groupTextWrapper: {
    flex: 1,
  },
  groupName: {
    ...typography.h4,
    marginBottom: recommendedSpacing.tight,
  },
  groupSummary: {
    ...typography.bodySmall,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 64, // Emoji icon, not typography
    marginBottom: recommendedSpacing.loose,
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: recommendedSpacing.default,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
  },
  newGroupButton: {
    marginHorizontal: 24,
    marginTop: recommendedSpacing.loose,
  },
  fab: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
  },
});

export default HomeScreen;
