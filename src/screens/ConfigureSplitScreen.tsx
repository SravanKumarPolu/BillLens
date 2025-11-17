import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfigureSplit'>;

type Member = {
  id: string;
  name: string;
};

const MOCK_MEMBERS: Member[] = [
  { id: 'you', name: 'You' },
  { id: '1', name: 'Priya' },
  { id: '2', name: 'Arjun' },
];

const ConfigureSplitScreen: React.FC<Props> = ({ navigation }) => {
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>(MOCK_MEMBERS.map(m => m.id));

  const toggleMember = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    // TODO: commit split; go to group detail for now.
    navigation.navigate('GroupDetail', { groupId: '1' });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who is this for?</Text>
      <Text style={styles.subtitle}>Choose people and how you want to split.</Text>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'equal' && styles.modeChipActive]}
          onPress={() => setMode('equal')}
        >
          <Text
            style={[styles.modeLabel, mode === 'equal' && styles.modeLabelActive]}
          >
            Equal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'custom' && styles.modeChipActive]}
          onPress={() => setMode('custom')}
        >
          <Text
            style={[styles.modeLabel, mode === 'custom' && styles.modeLabelActive]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={MOCK_MEMBERS}
        keyExtractor={m => m.id}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity
              style={[styles.memberRow, selected && styles.memberRowSelected]}
              onPress={() => toggleMember(item.id)}
            >
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberShare}>{mode === 'equal' ? 'Equal share' : 'Tap to edit'}</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.membersList}
      />

      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>Total split between {selectedIds.length} people.</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryLabel}>Save expense</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceCard,
    marginRight: 8,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  modeLabelActive: {
    color: colors.white,
    fontWeight: '600',
  },
  membersList: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  memberRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  memberName: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  memberShare: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  summaryBox: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ConfigureSplitScreen;
