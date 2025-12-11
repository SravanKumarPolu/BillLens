import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { Button, Input } from '../components';
import { useGroups } from '../context/GroupsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

const CreateGroupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { addGroup } = useGroups();
  const { colors } = useTheme();
  const { suggestedName, suggestedEmoji, suggestedType } = route.params || {};
  
  // Set default emoji based on type
  const getDefaultEmoji = (type?: string) => {
    switch (type) {
      case 'friend':
        return '👫';
      case 'trip':
        return '✈️';
      case 'event':
        return '🎉';
      case 'office':
        return '💼';
      case 'house':
        return '🏠';
      default:
        return suggestedEmoji || '🏠';
    }
  };
  
  const [name, setName] = useState(suggestedName || '');
  const [emoji, setEmoji] = useState(getDefaultEmoji(suggestedType));

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    // Add default members (You + one other)
    // For friends, ensure only 2 members (1-to-1)
    const defaultMembers = [
      { id: 'you', name: 'You' },
      { id: 'priya', name: 'Priya' },
    ];

    addGroup({
      name: name.trim(),
      emoji,
      members: defaultMembers,
      currency: 'INR',
      type: suggestedType || 'custom',
    });

    navigation.navigate('Home');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {suggestedType === 'friend' ? 'Add friend' : 'New group'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {suggestedType === 'friend' 
              ? 'Track expenses with a single person. Give your friend a name.'
              : 'Give your group a name and an emoji.'}
          </Text>
        </View>
      </View>

      <View style={styles.emojiRow}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.changeHint, { color: colors.textSecondary }]}>Tap to change later (MVP keeps it simple).</Text>
      </View>

      <Input
        placeholder={suggestedType === 'friend' ? "e.g. Priya, Arjun, John" : "e.g. Our Home, Goa Trip, Us Two"}
        value={name}
        onChangeText={setName}
        containerStyle={styles.inputContainer}
      />

      <Button
        title={suggestedType === 'friend' ? "Add friend" : "Create group"}
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
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 16,
    marginTop: 4,
  },
  backButtonText: {
    ...typography.navigation,
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
