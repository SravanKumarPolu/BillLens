import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button, Input, Modal, BackButton } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { getCollectionSummary, type CollectionSummary } from '../utils/collectionService';
import { GroupCollection, Expense } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Collections'>;

const CollectionsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { groupId } = route.params;
  const { 
    getCollectionsForGroup, 
    getGroup, 
    expenses, 
    addCollection, 
    deleteCollection,
    getExpensesForGroup 
  } = useGroups();
  const { colors } = useTheme();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const styles = createStyles(colors);

  const group = getGroup(groupId);
  const collections = getCollectionsForGroup(groupId);
  const groupExpenses = getExpensesForGroup(groupId);

  // Get collection summaries
  const collectionSummaries = useMemo(() => {
    return collections.map(collection => 
      getCollectionSummary(collection, groupExpenses)
    ).sort((a, b) => 
      new Date(b.collection.createdAt).getTime() - new Date(a.collection.createdAt).getTime()
    );
  }, [collections, groupExpenses]);

  const handleCreateCollection = () => {
    if (!collectionName.trim()) {
      Alert.alert('Error', 'Please enter a collection name');
      return;
    }

    const collectionId = addCollection({
      groupId,
      name: collectionName.trim(),
      description: collectionDescription.trim() || undefined,
      expenseIds: [],
      createdBy: 'you',
    });

    setCollectionName('');
    setCollectionDescription('');
    setShowCreateModal(false);
    
    // Navigate to collection detail to add expenses
    navigation.navigate('CollectionDetail', { collectionId, groupId });
  };

  const handleDeleteCollection = (collectionId: string, collectionName: string) => {
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collectionName}"? This will not delete the expenses, only remove them from the collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCollection(collectionId);
          },
        },
      ]
    );
  };

  const renderCollection = ({ item }: { item: CollectionSummary }) => {
    const { collection, expenseCount, totalAmount, currency, dateRange } = item;

    return (
      <Card
        style={styles.collectionCard}
        onPress={() => navigation.navigate('CollectionDetail', { collectionId: collection.id, groupId })}
      >
        <View style={styles.collectionHeader}>
          <View style={styles.collectionLeft}>
            <Text style={[styles.collectionName, { color: colors.textPrimary }]}>
              {collection.name}
            </Text>
            {collection.description && (
              <Text style={[styles.collectionDescription, { color: colors.textSecondary }]}>
                {collection.description}
              </Text>
            )}
            <View style={styles.collectionMeta}>
              <Text style={[styles.collectionMetaText, { color: colors.textSecondary }]}>
                {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
              </Text>
              {dateRange && (
                <Text style={[styles.collectionMetaText, { color: colors.textSecondary }]}>
                  • {new Date(dateRange.start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.collectionRight}>
            <Text style={[styles.collectionAmount, { color: colors.textPrimary }]}>
              {formatMoney(totalAmount, false, currency)}
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteCollection(collection.id, collection.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.deleteButtonText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  if (!group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Group not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <BackButton style={styles.backButtonContainer} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Collections</Text>
        <TouchableOpacity
          onPress={() => setShowCreateModal(true)}
          style={styles.addButton}
        >
          <Text style={[styles.addButtonText, { color: colors.primary }]}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {collectionSummaries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
              No collections yet
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Create a collection to group related bills together
            </Text>
            <Button
              title="Create Collection"
              onPress={() => setShowCreateModal(true)}
              variant="primary"
              style={styles.emptyButton}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {collectionSummaries.length} {collectionSummaries.length === 1 ? 'collection' : 'collections'}
            </Text>
            <FlatList
              data={collectionSummaries}
              keyExtractor={item => item.collection.id}
              renderItem={renderCollection}
              scrollEnabled={false}
              contentContainerStyle={styles.collectionsList}
            />
          </>
        )}
      </ScrollView>

      {/* Create Collection Modal */}
      <Modal
        visible={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCollectionName('');
          setCollectionDescription('');
        }}
        title="Create Collection"
        variant="glass"
      >
        <View style={styles.modalContent}>
          <Input
            label="Collection Name"
            value={collectionName}
            onChangeText={setCollectionName}
            placeholder="e.g., Weekend Trip, Monthly Groceries"
            autoFocus
          />
          <Input
            label="Description (Optional)"
            value={collectionDescription}
            onChangeText={setCollectionDescription}
            placeholder="Add a description..."
            multiline
            style={styles.descriptionInput}
          />
          <View style={styles.modalButtons}>
            <Button
              title="Cancel"
              onPress={() => {
                setShowCreateModal(false);
                setCollectionName('');
                setCollectionDescription('');
              }}
              variant="secondary"
              style={styles.modalButton}
            />
            <Button
              title="Create"
              onPress={handleCreateCollection}
              variant="primary"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
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
  backButtonContainer: {
    minWidth: 60,
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  addButtonText: {
    ...typography.navigation,
    ...typography.emphasis.semibold,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  sectionTitle: {
    ...typography.bodySmall,
    marginBottom: 16,
    marginTop: 8,
  },
  collectionsList: {
    gap: 12,
  },
  collectionCard: {
    padding: 16,
    marginBottom: 12,
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  collectionLeft: {
    flex: 1,
    marginRight: 12,
  },
  collectionName: {
    ...typography.h4,
    marginBottom: 4,
  },
  collectionDescription: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  collectionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  collectionMetaText: {
    ...typography.caption,
  },
  collectionRight: {
    alignItems: 'flex-end',
  },
  collectionAmount: {
    ...typography.money,
    marginBottom: 8,
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteButtonText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 48,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    ...typography.h3,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    minWidth: 200,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 80,
  },
  modalContent: {
    paddingVertical: 8,
  },
  descriptionInput: {
    minHeight: 80,
    marginTop: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});

export default CollectionsScreen;
