import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Input } from '../components';
import { useGroups } from '../context/GroupsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

const CreateGroupScreen: React.FC<Props> = ({ navigation }) => {
  const { addGroup } = useGroups();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    // Add default members (You + one other)
    const defaultMembers = [
      { id: 'you', name: 'You' },
      { id: 'priya', name: 'Priya' },
    ];

    addGroup({
      name: name.trim(),
      emoji,
      members: defaultMembers,
    });

    navigation.navigate('Home');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>New group</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Give your group a name and an emoji.</Text>

      <View style={styles.emojiRow}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.changeHint, { color: colors.textSecondary }]}>Tap to change later (MVP keeps it simple).</Text>
      </View>

      <Input
        placeholder="e.g. Our Home, Goa Trip, Us Two"
        value={name}
        onChangeText={setName}
        containerStyle={styles.inputContainer}
      />

      <Button
        title="Create group"
        onPress={handleCreate}
        variant="primary"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    ...typography.h2,
    marginBottom: recommendedSpacing.default,
  },
  subtitle: {
    ...typography.body,
    marginBottom: recommendedSpacing.extraLoose,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: recommendedSpacing.loose,
  },
  emoji: {
    fontSize: 32, // Emoji icon, not typography
    marginRight: 10,
  },
  changeHint: {
    ...typography.bodySmall,
  },
  inputContainer: {
    marginBottom: recommendedSpacing.extraLoose,
  },
});

export default CreateGroupScreen;
