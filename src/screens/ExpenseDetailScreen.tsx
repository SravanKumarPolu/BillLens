import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { typography, recommendedSpacing } from '../theme/typography';
import { useGroups } from '../context/GroupsContext';
import { Card, Button } from '../components';
import { formatMoney } from '../utils/formatMoney';
import { ExpenseComment } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'ExpenseDetail'>;

const ExpenseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { expenseId, groupId } = route.params;
  const { getExpense, getGroup, updateExpense } = useGroups();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const expense = getExpense(expenseId);
  const group = groupId ? getGroup(groupId) : (expense ? getGroup(expense.groupId) : null);
  
  const [comments, setComments] = useState<ExpenseComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (expense?.comments) {
      setComments(expense.comments);
    }
  }, [expense]);

  // Subscribe to real-time updates for this expense
  useEffect(() => {
    if (!expenseId) return;

    const checkForUpdates = () => {
      const currentExpense = getExpense(expenseId);
      if (currentExpense?.comments) {
        // Only update if comments have changed (avoid unnecessary re-renders)
        const currentCommentsStr = JSON.stringify(currentExpense.comments);
        const localCommentsStr = JSON.stringify(comments);
        
        if (currentCommentsStr !== localCommentsStr && editingCommentId === null) {
          // Only update if not currently editing a comment
          setComments(currentExpense.comments);
        }
      }
    };

    // Check for updates every 2 seconds (real-time polling)
    // In production, this could use WebSocket for true real-time
    const interval = setInterval(checkForUpdates, 2000);
    
    return () => clearInterval(interval);
  }, [expenseId, comments, getExpense, editingCommentId]);

  if (!expense || !group) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>Expense not found</Text>
        </View>
      </View>
    );
  }

  const paidByMember = group.members.find(m => m.id === expense.paidBy);
  const splitMembers = expense.splits.map(s => {
    const member = group.members.find(m => m.id === s.memberId);
    return { member, amount: s.amount };
  });

  const handleAddComment = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const newCommentObj: ExpenseComment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        memberId: 'you',
        text: newComment.trim(),
        createdAt: new Date().toISOString(),
      };

      const updatedComments = [...comments, newCommentObj];
      setComments(updatedComments);
      setNewComment('');

      // Update expense with new comment
      // Notification will be generated in GroupsContext.updateExpense if comment is from someone else
      updateExpense(expenseId, { comments: updatedComments }, 'you');
    } catch (error) {
      Alert.alert('Error', 'Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditComment = (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (comment && comment.memberId === 'you') {
      setEditingCommentId(commentId);
      setEditCommentText(comment.text);
      setSelectedCommentId(null);
    }
  };

  const handleSaveEditComment = async () => {
    if (!editingCommentId || !editCommentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const updatedComments = comments.map(comment =>
        comment.id === editingCommentId
          ? { ...comment, text: editCommentText.trim(), updatedAt: new Date().toISOString() }
          : comment
      );

      setComments(updatedComments);
      setEditingCommentId(null);
      setEditCommentText('');

      // Update expense with edited comment
      updateExpense(expenseId, { comments: updatedComments }, 'you');
      
      // Track for sync
      (async () => {
        try {
          const { syncService } = await import('../utils/syncService');
          await syncService.addPendingChange('update', 'expense', expenseId, {
            ...expense,
            comments: updatedComments,
          });
        } catch (error) {
          console.error('Error tracking comment edit for sync:', error);
        }
      })();
    } catch (error) {
      Alert.alert('Error', 'Failed to edit comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentText('');
  };

  const handleDeleteComment = (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedComments = comments.filter(c => c.id !== commentId);
              setComments(updatedComments);
              setSelectedCommentId(null);

              // Update expense with deleted comment
              updateExpense(expenseId, { comments: updatedComments }, 'you');
              
              // Track for sync
              (async () => {
                try {
                  const { syncService } = await import('../utils/syncService');
                  await syncService.addPendingChange('update', 'expense', expenseId, {
                    ...expense,
                    comments: updatedComments,
                  });
                } catch (error) {
                  console.error('Error tracking comment deletion for sync:', error);
                }
              })();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete comment');
            }
          },
        },
      ]
    );
  };

  const handleLongPressComment = (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (comment && comment.memberId === 'you') {
      setSelectedCommentId(selectedCommentId === commentId ? null : commentId);
    }
  };

  const handleEditExpense = () => {
    navigation.navigate('AddExpense', {
      expenseId,
      groupId: expense.groupId,
    });
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceLight }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleEditExpense} style={styles.editButton}>
          <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Expense Header */}
        <Card style={styles.expenseHeaderCard}>
          <View style={styles.expenseHeaderTop}>
            {expense.receipts && expense.receipts.length > 0 ? (
              <Image source={{ uri: expense.receipts[0].uri }} style={styles.expenseImage} />
            ) : expense.imageUri ? (
              <Image source={{ uri: expense.imageUri }} style={styles.expenseImage} />
            ) : (
              <View style={[styles.expenseImagePlaceholder, { backgroundColor: colors.borderSubtle }]}>
                <Text style={styles.expenseImagePlaceholderText}>📷</Text>
              </View>
            )}
            <View style={styles.expenseHeaderInfo}>
              <Text style={[styles.expenseTitle, { color: colors.textPrimary }]}>
                {expense.merchant || expense.title}
              </Text>
              <Text style={[styles.expenseCategory, { color: colors.textSecondary }]}>
                {expense.category}
              </Text>
              <Text style={[styles.expenseAmount, { color: colors.textPrimary }]}>
                {formatMoney(expense.amount, false, expense.currency)}
              </Text>
              <Text style={[styles.expenseDate, { color: colors.textSecondary }]}>
                {new Date(expense.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>

          {/* Payment Info */}
          <View style={[styles.paymentInfo, { borderTopColor: colors.borderSubtle }]}>
            <View style={styles.paymentInfoRow}>
              <Text style={[styles.paymentInfoLabel, { color: colors.textSecondary }]}>Paid by:</Text>
              <Text style={[styles.paymentInfoValue, { color: colors.textPrimary }]}>
                {paidByMember?.name || 'Unknown'}
              </Text>
            </View>
            {expense.paymentMode && (
              <View style={styles.paymentInfoRow}>
                <Text style={[styles.paymentInfoLabel, { color: colors.textSecondary }]}>Payment:</Text>
                <Text style={[styles.paymentInfoValue, { color: colors.textPrimary }]}>
                  {expense.paymentMode}
                </Text>
              </View>
            )}
            {expense.isReimbursement && (
              <View style={styles.paymentInfoRow}>
                <Text style={[styles.paymentInfoLabel, { color: colors.textSecondary }]}>Type:</Text>
                <Text style={[styles.paymentInfoValue, { color: colors.accent }]}>
                  💰 Reimbursement
                </Text>
              </View>
            )}
          </View>

          {/* Split Details */}
          <View style={[styles.splitSection, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.splitSectionTitle, { color: colors.textPrimary }]}>Split Details</Text>
            {splitMembers.map(({ member, amount }) => (
              <View key={member?.id} style={styles.splitRow}>
                <Text style={[styles.splitMemberName, { color: colors.textPrimary }]}>
                  {member?.name || 'Unknown'}
                </Text>
                <Text style={[styles.splitAmount, { color: colors.textPrimary }]}>
                  {formatMoney(amount, false, expense.currency)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Comments / Chat Thread */}
        <Card style={styles.commentsCard}>
          <View style={styles.commentsHeader}>
            <Text style={[styles.commentsTitle, { color: colors.textPrimary }]}>
              Comments & Discussion
            </Text>
            {comments.length > 0 && (
              <Text style={[styles.commentsCount, { color: colors.textSecondary }]}>
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </Text>
            )}
          </View>

          {/* Comments List */}
          {comments.length > 0 ? (
            <View style={styles.commentsList}>
              {comments.map((comment, index) => {
                const member = group.members.find(m => m.id === comment.memberId);
                const isYou = comment.memberId === 'you';
                const showDateSeparator = index === 0 || 
                  new Date(comment.createdAt).toDateString() !== 
                  new Date(comments[index - 1].createdAt).toDateString();

                return (
                  <View key={comment.id}>
                    {showDateSeparator && (
                      <View style={styles.dateSeparator}>
                        <View style={[styles.dateSeparatorLine, { backgroundColor: colors.borderSubtle }]} />
                        <Text style={[styles.dateSeparatorText, { color: colors.textSecondary }]}>
                          {new Date(comment.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </Text>
                        <View style={[styles.dateSeparatorLine, { backgroundColor: colors.borderSubtle }]} />
                      </View>
                    )}
                    <TouchableOpacity
                      onLongPress={() => handleLongPressComment(comment.id)}
                      activeOpacity={0.7}
                    >
                      {editingCommentId === comment.id ? (
                        <View style={[styles.commentEditContainer, { backgroundColor: colors.surfaceCard }]}>
                          <TextInput
                            style={[
                              styles.commentEditInput,
                              {
                                color: colors.textPrimary,
                                borderColor: colors.borderSubtle,
                                backgroundColor: colors.surfaceLight,
                              },
                            ]}
                            value={editCommentText}
                            onChangeText={setEditCommentText}
                            multiline
                            maxLength={1000}
                            textAlignVertical="top"
                            autoFocus
                          />
                          <View style={styles.commentEditActions}>
                            <TouchableOpacity
                              style={[styles.commentEditButton, { backgroundColor: colors.primary }]}
                              onPress={handleSaveEditComment}
                              disabled={!editCommentText.trim() || isSubmitting}
                            >
                              <Text style={[styles.commentEditButtonText, { color: colors.white }]}>
                                Save
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.commentEditButton, { backgroundColor: colors.borderSubtle }]}
                              onPress={handleCancelEditComment}
                            >
                              <Text style={[styles.commentEditButtonText, { color: colors.textSecondary }]}>
                                Cancel
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.commentBubble,
                            isYou
                              ? [styles.commentBubbleRight, { backgroundColor: colors.primary }]
                              : [styles.commentBubbleLeft, { backgroundColor: colors.surfaceCard }],
                            selectedCommentId === comment.id && styles.commentBubbleSelected,
                          ]}
                        >
                          {!isYou && (
                            <Text style={[styles.commentAuthorName, { color: colors.textSecondary }]}>
                              {member?.name || 'Unknown'}
                            </Text>
                          )}
                          <Text
                            style={[
                              styles.commentText,
                              isYou ? { color: colors.white } : { color: colors.textPrimary },
                            ]}
                          >
                            {comment.text}
                          </Text>
                          <View style={styles.commentFooter}>
                            <Text
                              style={[
                                styles.commentTime,
                                isYou ? { color: colors.white + 'CC' } : { color: colors.textSecondary },
                              ]}
                            >
                              {formatRelativeTime(comment.createdAt)}
                              {comment.updatedAt && comment.updatedAt !== comment.createdAt && ' (edited)'}
                            </Text>
                          </View>
                        </View>
                      )}
                      {selectedCommentId === comment.id && isYou && editingCommentId !== comment.id && (
                        <View style={[styles.commentActionsMenu, { backgroundColor: colors.surfaceCard }]}>
                          <TouchableOpacity
                            style={styles.commentActionButton}
                            onPress={() => {
                              handleEditComment(comment.id);
                            }}
                          >
                            <Text style={[styles.commentActionText, { color: colors.primary }]}>
                              ✏️ Edit
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.commentActionButton}
                            onPress={() => {
                              handleDeleteComment(comment.id);
                            }}
                          >
                            <Text style={[styles.commentActionText, { color: colors.error }]}>
                              🗑️ Delete
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.commentActionButton}
                            onPress={() => setSelectedCommentId(null)}
                          >
                            <Text style={[styles.commentActionText, { color: colors.textSecondary }]}>
                              Cancel
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyComments}>
              <Text style={styles.emptyCommentsEmoji}>💬</Text>
              <Text style={[styles.emptyCommentsText, { color: colors.textSecondary }]}>
                No comments yet
              </Text>
              <Text style={[styles.emptyCommentsSubtext, { color: colors.textSecondary }]}>
                Start a discussion about this expense
              </Text>
            </View>
          )}

          {/* Add Comment Input */}
          <View style={[styles.addCommentContainer, { borderTopColor: colors.borderSubtle }]}>
            <View style={styles.commentInputWrapper}>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.borderSubtle,
                    backgroundColor: colors.surfaceLight,
                  },
                ]}
                placeholder="Add a note, ask a question, or discuss this expense..."
                placeholderTextColor={colors.textSecondary}
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: newComment.trim() ? colors.primary : colors.borderSubtle,
                  },
                ]}
                onPress={handleAddComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                <Text
                  style={[
                    styles.sendButtonText,
                    { color: newComment.trim() ? colors.white : colors.textSecondary },
                  ]}
                >
                  {isSubmitting ? '...' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.commentHint, { color: colors.textSecondary }]}>
              💡 Use comments to add notes, discuss items, or ask for clarifications
            </Text>
          </View>
        </Card>
      </ScrollView>
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
  backButton: {
    minWidth: 60,
  },
  backButtonText: {
    ...typography.navigation,
  },
  editButton: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  editButtonText: {
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  expenseHeaderCard: {
    marginBottom: 16,
    padding: 20,
  },
  expenseHeaderTop: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  expenseImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
  },
  expenseImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseImagePlaceholderText: {
    fontSize: 32,
  },
  expenseHeaderInfo: {
    flex: 1,
  },
  expenseTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  expenseCategory: {
    ...typography.bodySmall,
    marginBottom: 8,
  },
  expenseAmount: {
    ...typography.moneyLarge,
    marginBottom: 4,
  },
  expenseDate: {
    ...typography.bodySmall,
  },
  paymentInfo: {
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentInfoLabel: {
    ...typography.bodySmall,
  },
  paymentInfoValue: {
    ...typography.body,
    ...typography.emphasis.medium,
  },
  splitSection: {
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  splitSectionTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  splitMemberName: {
    ...typography.body,
  },
  splitAmount: {
    ...typography.money,
  },
  commentsCard: {
    padding: 20,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  commentsTitle: {
    ...typography.h4,
  },
  commentsCount: {
    ...typography.bodySmall,
  },
  commentsList: {
    marginBottom: 16,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorText: {
    ...typography.caption,
    marginHorizontal: 12,
  },
  commentBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    maxWidth: '85%',
  },
  commentBubbleLeft: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  commentBubbleRight: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  commentAuthorName: {
    ...typography.caption,
    ...typography.emphasis.semibold,
    marginBottom: 4,
  },
  commentText: {
    ...typography.body,
    marginBottom: 4,
  },
  commentTime: {
    ...typography.caption,
    fontSize: 10,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyCommentsEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyCommentsText: {
    ...typography.body,
    marginBottom: 4,
  },
  emptyCommentsSubtext: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  addCommentContainer: {
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  commentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  commentInput: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    ...typography.body,
    ...typography.emphasis.semibold,
  },
  commentHint: {
    ...typography.caption,
    fontSize: 11,
    fontStyle: 'italic',
  },
  commentBubbleSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  commentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  commentEditContainer: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  commentEditInput: {
    ...typography.body,
    minHeight: 60,
    maxHeight: 120,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  commentEditActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  commentEditButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commentEditButtonText: {
    ...typography.bodySmall,
    ...typography.emphasis.semibold,
  },
  commentActionsMenu: {
    position: 'absolute',
    right: 0,
    top: -60,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
    minWidth: 120,
  },
  commentActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  commentActionText: {
    ...typography.body,
  },
});

export default ExpenseDetailScreen;
