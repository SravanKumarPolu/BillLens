import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Templates'>;

type TemplateItem = {
  id: string;
  name: string;
  lastAmount?: string;
};

const TEMPLATES: TemplateItem[] = [
  { id: 'rent', name: 'Rent', lastAmount: '₹12,000' },
  { id: 'eb', name: 'Electricity / EB', lastAmount: '₹2,100' },
  { id: 'wifi', name: 'WiFi', lastAmount: '₹799' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'maid', name: 'Maid' },
  { id: 'ott', name: 'OTT (Netflix, Prime, etc.)' },
];

const TemplatesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;

  const handleUseTemplate = (item: TemplateItem) => {
    // TODO: prefill a new expense from template.
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick add</Text>
      <Text style={styles.subtitle}>Zero-typing templates for your shared life.</Text>

      <FlatList
        data={TEMPLATES}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleUseTemplate(item)}
          >
            <View>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.lastAmount && (
                <Text style={styles.cardSubtitle}>Last: {item.lastAmount}</Text>
              )}
            </View>
            <Text style={styles.addLabel}>Add</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
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
  list: {
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  addLabel: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
});

export default TemplatesScreen;
