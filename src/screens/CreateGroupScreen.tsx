import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Button, Input } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

const CreateGroupScreen: React.FC<Props> = ({ navigation }) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');

  const handleCreate = () => {
    // TODO: persist new group; for now, just go back home.
    navigation.navigate('Home');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New group</Text>
      <Text style={styles.subtitle}>Give your group a name and an emoji.</Text>

      <View style={styles.emojiRow}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.changeHint}>Tap to change later (MVP keeps it simple).</Text>
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
    backgroundColor: colors.surfaceLight,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  emoji: {
    fontSize: 32,
    marginRight: 10,
  },
  changeHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  inputContainer: {
    marginBottom: 24,
  },
});

export default CreateGroupScreen;
