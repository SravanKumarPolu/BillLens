import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { formatMoney } from '../utils/formatMoney';

type Props = NativeStackScreenProps<RootStackParamList, 'Templates'>;

type TemplateItem = {
  id: string;
  name: string;
  category: string;
};

const TEMPLATES: TemplateItem[] = [
  { id: 'rent', name: 'Rent', category: 'Rent' },
  { id: 'eb', name: 'Electricity / EB', category: 'Utilities' },
  { id: 'wifi', name: 'WiFi', category: 'WiFi' },
  { id: 'groceries', name: 'Groceries', category: 'Groceries' },
  { id: 'maid', name: 'Maid', category: 'Maid' },
  { id: 'ott', name: 'OTT (Netflix, Prime, etc.)', category: 'OTT' },
];

const TemplatesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { getTemplateLastAmount } = useGroups();
  const { colors } = useTheme();

  const handleUseTemplate = (item: TemplateItem) => {
    const lastAmount = getTemplateLastAmount(item.id);
    
    // Navigate to AddExpense with pre-filled template data
    // Since we don't have an image, we'll skip OCR and go directly to AddExpense
    navigation.navigate('AddExpense', {
      imageUri: '', // No image for templates
      groupId: groupId || '1',
      parsedAmount: lastAmount ? lastAmount.toString() : '',
      parsedMerchant: item.name,
      parsedDate: '',
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Quick add</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Zero-typing templates for your shared life.</Text>

      <FlatList
        data={TEMPLATES}
        keyExtractor={t => t.id}
        renderItem={({ item }) => {
          const lastAmount = getTemplateLastAmount(item.id);
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surfaceCard }]}
              onPress={() => handleUseTemplate(item)}
            >
              <View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
                {lastAmount && (
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Last: {formatMoney(lastAmount)}</Text>
                )}
              </View>
              <Text style={[styles.addLabel, { color: colors.accent }]}>Add</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
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
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  cardSubtitle: {
    ...typography.bodySmall,
  },
  addLabel: {
    ...typography.body,
    fontWeight: '600',
  },
});

export default TemplatesScreen;
