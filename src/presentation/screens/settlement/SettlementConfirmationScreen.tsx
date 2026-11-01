/**
 * SettlementConfirmationScreen — receiver reviews a pending settlement.
 *
 * Phase 6 Track 5 / Phase 7 UI.
 *
 * Displays the settlement details and offers five receiver actions:
 *   1. Confirm full amount (ConfirmSettlementUseCase)
 *   2. Confirm different amount (CorrectSettlementAmountUseCase)
 *   3. Dispute (DisputeSettlementUseCase with 8 reason taxonomy)
 *   4. Request more info (RequestMoreInfoUseCase)
 *   5. Mark duplicate (MarkDuplicateSettlementUseCase)
 *
 * The screen is a presentational component that takes the settlement
 * view model and action callbacks as props — the container handles
 * the use case calls.
 */


import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import type { Settlement, SettlementDisputeReason } from '@domain/entities/settlement';
import { ALL_DISPUTE_REASONS } from '@domain/entities/settlement';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { parseMoneyInput } from '@presentation/utils/parse-money-input';

/** Validity gate for the corrected-amount input (shared parser). */
function isValidCorrection(raw: string, currencyCode: string): boolean {
  return parseMoneyInput(raw, currencyCode).ok;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface SettlementConfirmationViewModel {
  readonly settlement: Settlement;
  readonly fromMemberName: string;
  readonly toMemberName: string;
  readonly formattedAmount: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SettlementConfirmationScreenProps {
  readonly viewModel: SettlementConfirmationViewModel;
  readonly onConfirm: () => void;
  readonly onCorrectAmount: (correctedAmountMinor: number) => void;
  readonly onDispute: (reason: SettlementDisputeReason, note?: string) => void;
  readonly onRequestMoreInfo: (note: string) => void;
  readonly onMarkDuplicate: (duplicateOfSettlementId?: string) => void;
  readonly loading?: boolean;
}

// ---------------------------------------------------------------------------
// Dispute reason labels
// ---------------------------------------------------------------------------

const DISPUTE_REASON_LABELS: Record<SettlementDisputeReason, string> = {
  not_received: 'Payment not received',
  wrong_amount: 'Wrong amount',
  wrong_currency: 'Wrong currency',
  wrong_sender: 'Wrong sender',
  duplicate: 'Duplicate settlement',
  failed: 'Payment failed',
  reversed: 'Payment was reversed externally',
  other: 'Other (note required)',
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SettlementConfirmationScreen({
  viewModel,
  onConfirm,
  onCorrectAmount,
  onDispute,
  onRequestMoreInfo,
  onMarkDuplicate,
  loading = false,
}: SettlementConfirmationScreenProps): JSX.Element {
  const theme = useTheme();
  const { settlement, fromMemberName, toMemberName, formattedAmount } = viewModel;

  const [action, setAction] = useState<'none' | 'confirm' | 'correct' | 'dispute' | 'requestInfo' | 'duplicate'>('none');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [disputeReason, setDisputeReason] = useState<SettlementDisputeReason | ''>('');
  const [disputeNote, setDisputeNote] = useState('');
  const [requestInfoNote, setRequestInfoNote] = useState('');

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    fontSize: 16,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    color: theme.colors.textSecondary,
    marginBottom: spacing.xs,
  };

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        {/* Title */}
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Confirm payment
          </Text>
          <Text variant="caption" color="muted">
            Review and confirm or dispute this settlement.
          </Text>
        </Stack>

        {/* Settlement details card */}
        <Card elevation="md" padding="lg">
          <Stack gap="md" align="stretch">
            {/* From → To */}
            <Row gap="md" align="center">
              <Avatar name={fromMemberName} size="md" />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="caption" color="muted">From</Text>
                <Text variant="bodyStrong" color="primary">{fromMemberName}</Text>
              </Stack>
              <Icon name="arrow-forward" size={theme.iconSizes.md} color={theme.colors.textMuted} />
              <Stack gap={0} style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text variant="caption" color="muted">To</Text>
                <Text variant="bodyStrong" color="primary">{toMemberName}</Text>
              </Stack>
              <Avatar name={toMemberName} size="md" />
            </Row>

            {/* Amount */}
            <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border, paddingTop: spacing.md }}>
              <Row gap="md" align="center" >
                <Text variant="caption" color="muted">Amount</Text>
                <Text variant="amountMedium" color="primary">{formattedAmount}</Text>
              </Row>
            </View>

            {/* Method */}
            <Row gap="md" align="center" >
              <Text variant="caption" color="muted">Method</Text>
              <Text variant="body" color="primary">
                {settlement.method.replace('_', ' ').toUpperCase()}
              </Text>
            </Row>

            {/* Date */}
            <Row gap="md" align="center" >
              <Text variant="caption" color="muted">Date</Text>
              <Text variant="body" color="primary">
                {new Date(settlement.settlementDate as string).toLocaleDateString()}
              </Text>
            </Row>

            {/* Note */}
            {settlement.note !== undefined && (
              <Row gap="md" align="center" >
                <Text variant="caption" color="muted">Note</Text>
                <Text variant="body" color="primary" style={{ flex: 1, textAlign: 'right' }}>
                  {settlement.note}
                </Text>
              </Row>
            )}

            {/* Status badge */}
            <Row gap="sm" align="center" style={{ paddingTop: spacing.sm }}>
              <View style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: theme.borderRadius.sm,
                backgroundColor: theme.colors.warning,
              }}>
                <Text variant="label" color="onColor">
                  PENDING CONFIRMATION
                </Text>
              </View>
            </Row>
          </Stack>
        </Card>

        {/* Action buttons */}
        {action === 'none' && (
          <Stack gap="md" align="stretch">
            <Button
              label="Confirm payment"
              variant="primary"
              icon="checkmark-circle"
              onPress={() => setAction('confirm')}
              loading={loading}
              accessibilityLabel="Confirm this payment"
            />
            <Button
              label="Correct amount"
              variant="secondary"
              icon="create"
              onPress={() => setAction('correct')}
              accessibilityLabel="Confirm a different amount"
            />
            <Button
              label="Dispute"
              variant="destructive"
              icon="alert-circle"
              onPress={() => setAction('dispute')}
              accessibilityLabel="Dispute this payment"
            />
            <Button
              label="Request more info"
              variant="ghost"
              icon="help-circle"
              onPress={() => setAction('requestInfo')}
              accessibilityLabel="Ask the payer for more information"
            />
            <Button
              label="Mark as duplicate"
              variant="ghost"
              icon="copy"
              onPress={() => setAction('duplicate')}
              accessibilityLabel="Mark this settlement as a duplicate"
            />
          </Stack>
        )}

        {/* Confirm action */}
        {action === 'confirm' && (
          <Stack gap="md" align="stretch">
            <Text variant="bodyStrong" color="primary">
              Confirm {formattedAmount} from {fromMemberName}?
            </Text>
            <Text variant="caption" color="muted">
              This will mark the settlement as completed. The balance will reflect the payment immediately.
            </Text>
            <Row gap="md" align="center">
              <Button label="Cancel" variant="ghost" onPress={() => setAction('none')} style={{ flex: 1 }} />
              <Button label="Confirm" variant="primary" onPress={onConfirm} loading={loading} style={{ flex: 2 }} />
            </Row>
          </Stack>
        )}

        {/* Correct amount action */}
        {action === 'correct' && (
          <Stack gap="md" align="stretch">
            <Text variant="bodyStrong" color="primary">Correct the amount</Text>
            <Text variant="caption" color="muted">
              The original will be disputed and a new draft with the corrected amount will be created.
            </Text>
            <Text style={labelStyle}>CORRECTED AMOUNT ({settlement.currencyCode})</Text>
            <TextInput
              value={correctedAmount}
              onChangeText={(v) => setCorrectedAmount(v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={inputStyle}
              accessibilityLabel="Corrected settlement amount"
            />
            <Row gap="md" align="center">
              <Button label="Cancel" variant="ghost" onPress={() => setAction('none')} style={{ flex: 1 }} />
              <Button
                label="Submit correction"
                variant="primary"
                onPress={() => {
                  // v2.4.0: shared string-arithmetic parser — never
                  // parseFloat (float rounding + hardcoded x100 broke
                  // 1.005-style values, JPY, and KWD).
                  const parsed = parseMoneyInput(correctedAmount, settlement.currencyCode);
                  if (parsed.ok) onCorrectAmount(parsed.minor);
                }}
                disabled={!isValidCorrection(correctedAmount, settlement.currencyCode)}
                loading={loading}
                style={{ flex: 2 }}
              />
            </Row>
          </Stack>
        )}

        {/* Dispute action */}
        {action === 'dispute' && (
          <Stack gap="md" align="stretch">
            <Text variant="bodyStrong" color="primary">Dispute this payment</Text>
            <Text style={labelStyle}>REASON</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <Stack gap="sm" align="stretch">
                {ALL_DISPUTE_REASONS.map((reason) => {
                  const selected = disputeReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      onPress={() => setDisputeReason(reason)}
                      accessibilityRole="radio"
                      accessibilityLabel={DISPUTE_REASON_LABELS[reason]}
                      accessibilityState={{ selected }}
                    >
                      <Card elevation={selected ? 'sm' : 'none'} padding="md" style={{
                        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                        borderWidth: 1,
                      }}>
                        <Row gap="sm" align="center">
                          {selected && <Icon name="radio-button-on" size={theme.iconSizes.md} color={theme.colors.brandPrimary} />}
                          {!selected && <Icon name="radio-button-off" size={theme.iconSizes.md} color={theme.colors.textMuted} />}
                          <Text variant="body" color={selected ? 'primary' : 'secondary'}>
                            {DISPUTE_REASON_LABELS[reason]}
                          </Text>
                        </Row>
                      </Card>
                    </Pressable>
                  );
                })}
              </Stack>
            </ScrollView>
            {disputeReason !== '' && (
              <Stack gap="xs" align="stretch">
                <Text style={labelStyle}>NOTE {disputeReason === 'other' ? '(REQUIRED)' : '(OPTIONAL)'}</Text>
                <TextInput
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  placeholder={disputeReason === 'other' ? 'Please describe the issue...' : 'Optional context...'}
                  style={inputStyle}
                  multiline
                  accessibilityLabel="Dispute note"
                />
              </Stack>
            )}
            <Row gap="md" align="center">
              <Button label="Cancel" variant="ghost" onPress={() => setAction('none')} style={{ flex: 1 }} />
              <Button
                label="Submit dispute"
                variant="destructive"
                onPress={() => {
                  if (disputeReason !== '') {
                    onDispute(disputeReason as SettlementDisputeReason, disputeNote || undefined);
                  }
                }}
                disabled={disputeReason === '' || (disputeReason === 'other' && !disputeNote.trim())}
                loading={loading}
                style={{ flex: 2 }}
              />
            </Row>
          </Stack>
        )}

        {/* Request more info action */}
        {action === 'requestInfo' && (
          <Stack gap="md" align="stretch">
            <Text variant="bodyStrong" color="primary">Request more information</Text>
            <Text variant="caption" color="muted">
              Ask {fromMemberName} for more context about this payment.
            </Text>
            <TextInput
              value={requestInfoNote}
              onChangeText={setRequestInfoNote}
              placeholder="e.g. Which UPI app did you use?"
              style={inputStyle}
              multiline
              accessibilityLabel="Question for the payer"
            />
            <Row gap="md" align="center">
              <Button label="Cancel" variant="ghost" onPress={() => setAction('none')} style={{ flex: 1 }} />
              <Button
                label="Send request"
                variant="primary"
                onPress={() => {
                  if (requestInfoNote.trim()) onRequestMoreInfo(requestInfoNote.trim());
                }}
                disabled={!requestInfoNote.trim()}
                loading={loading}
                style={{ flex: 2 }}
              />
            </Row>
          </Stack>
        )}

        {/* Duplicate action */}
        {action === 'duplicate' && (
          <Stack gap="md" align="stretch">
            <Text variant="bodyStrong" color="primary">Mark as duplicate</Text>
            <Text variant="caption" color="muted">
              This will dispute the settlement with reason "duplicate".
            </Text>
            <Button
              label="Mark as duplicate"
              variant="destructive"
              onPress={() => onMarkDuplicate()}
              loading={loading}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setAction('none')} />
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}
