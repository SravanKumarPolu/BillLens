/**
 * BalanceExplanationScreen (Prompt 19) — the "why this balance?" screen.
 *
 * Renders the human-readable explanation produced by the explanation
 * engine (`src/domain/explanations/`):
 *   - Member name in the header
 *   - Summary card (Paid, Share, Settlements sent, Settlements received, Net balance)
 *   - Breakdown formula display (integer arithmetic only)
 *   - Expense contributions list
 *   - Settlement impact list
 *   - Rounding notes
 *
 * All data comes from the view model built from the explanation-engine
 * output — NO fake financial data. Phase 2 inputs are zero and the
 * resulting view model renders a legitimate "settled" empty state.
 *
 * Architecture:
 *   - The thin container `BalanceExplanationScreen` accepts a
 *     `BalanceExplanation` (or a `memberId` for an empty member) and
 *     builds a `BalanceExplanationViewModel` via
 *     `createBalanceExplanationViewModel`.
 *   - The pure presentational component `BalanceExplanationView`
 *     reads ONLY from the view model. No business logic.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';

import type { BalanceExplanation } from '@domain/explanations/explanation-types';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Badge } from '@presentation/design-system/components/Badge';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Divider } from '@presentation/design-system/components/Divider';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  type BalanceExplanationViewModel,
  type ContributionViewModel,
  type RoundingNoteViewModel,
  type SettlementImpactViewModel,
  createBalanceExplanationViewModel,
  createEmptyBalanceExplanation,
} from '@presentation/view-models/balance-explanation';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface BalanceExplanationScreenProps {
  readonly memberId: string;
  readonly memberName: string;
  readonly currencyCode: string;
  /** The explanation-engine output. When omitted, an empty (settled) VM is used. */
  readonly explanation?: BalanceExplanation;
}

export function BalanceExplanationScreen({
  memberId,
  memberName,
  currencyCode,
  explanation,
}: BalanceExplanationScreenProps): JSX.Element {
  const viewModel = useMemo<BalanceExplanationViewModel>(() => {
    if (explanation) {
      return createBalanceExplanationViewModel({
        explanation,
        memberName,
        currencyCode,
      });
    }
    return createEmptyBalanceExplanation(memberId, memberName, currencyCode);
  }, [explanation, memberId, memberName, currencyCode]);

  return <BalanceExplanationView viewModel={viewModel} onClose={() => router.dismiss()} />;
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface BalanceExplanationViewProps {
  readonly viewModel: BalanceExplanationViewModel;
  readonly onClose: () => void;
}

export function BalanceExplanationView({
  viewModel,
  onClose,
}: BalanceExplanationViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <Header viewModel={viewModel} />

        <SummaryCard viewModel={viewModel} />

        <FormulaCard viewModel={viewModel} />

        <ContributionsSection viewModel={viewModel} />

        <SettlementImpactsSection viewModel={viewModel} />

        <RoundingNotesSection viewModel={viewModel} />

        <Button
          label="Close"
          variant="secondary"
          onPress={onClose}
          accessibilityLabel="Close the balance explanation modal"
        />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function Header({ viewModel }: HeaderProps): ReactNode {
  return (
    <Stack gap="xs" align="stretch">
      <Text variant="caption" color="muted">
        Why this balance?
      </Text>
      <Row gap="md" align="center">
        <Avatar name={viewModel.memberName} size="lg" accessibilityLabel={`Avatar for ${viewModel.memberName}`} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="screenTitle" color="primary" accessibilityRole="header" numberOfLines={1}>
            {viewModel.memberName}
          </Text>
          <Text variant="caption" color="muted">
            {viewModel.currencyCode} · {viewModel.summaryLabel}
          </Text>
        </Stack>
      </Row>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function SummaryCard({ viewModel }: SummaryCardProps): ReactNode {
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Row gap="sm" align="center">
          <Text variant="label" color="secondary" style={{ flex: 1 }}>
            Net balance
          </Text>
          <SummaryBadge viewModel={viewModel} />
        </Row>
        <AmountText
          amountMinor={viewModel.netBalanceMinor}
          currencyCode={viewModel.currencyCode}
          variant="amountLarge"
          accessibilityLabel={`Net balance: ${viewModel.netBalanceMinor} ${viewModel.currencyCode}`}
        />
        <Divider />
        <Row gap="md" align="stretch" style={{ flexWrap: 'wrap' }}>
          <SummaryStat
            label="Paid"
            amountMinor={viewModel.paidMinor}
            currencyCode={viewModel.currencyCode}
          />
          <SummaryStat
            label="Your share"
            amountMinor={viewModel.shareMinor}
            currencyCode={viewModel.currencyCode}
          />
          <SummaryStat
            label="Settlements sent"
            amountMinor={viewModel.settlementsSentMinor}
            currencyCode={viewModel.currencyCode}
          />
          <SummaryStat
            label="Settlements received"
            amountMinor={viewModel.settlementsReceivedMinor}
            currencyCode={viewModel.currencyCode}
          />
        </Row>
      </Stack>
    </Card>
  );
}

interface SummaryStatProps {
  readonly label: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
}

function SummaryStat({ label, amountMinor, currencyCode }: SummaryStatProps): ReactNode {
  return (
    <Stack gap={0} style={{ flex: 1, minWidth: 140 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <AmountText
        amountMinor={amountMinor}
        currencyCode={currencyCode}
        variant="amountSmall"
        showSign={false}
        accessibilityLabel={`${label}: ${amountMinor} ${currencyCode}`}
      />
    </Stack>
  );
}

interface SummaryBadgeProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function SummaryBadge({ viewModel }: SummaryBadgeProps): ReactNode {
  switch (viewModel.summaryKey) {
    case 'creditor':
      return (
        <Badge variant="positive" label={viewModel.summaryLabel} icon="arrow-down-circle" />
      );
    case 'debtor':
      return (
        <Badge variant="negative" label={viewModel.summaryLabel} icon="arrow-up-circle" />
      );
    case 'settled':
    default:
      return (
        <Badge variant="positive" label={viewModel.summaryLabel} icon="checkmark-circle" />
      );
  }
}

// ---------------------------------------------------------------------------
// Formula card
// ---------------------------------------------------------------------------

interface FormulaCardProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function FormulaCard({ viewModel }: FormulaCardProps): ReactNode {
  const theme = useTheme();
  // The summaryText is multi-line; split into rows so each line gets its
  // own Text element (better screen-reader granularity than a single
  // block).
  const lines = viewModel.summaryText.split('\n');
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="label" color="secondary">
          How this was computed
        </Text>
        <View
          accessibilityLabel={`Formula: ${viewModel.summaryText.replace(/\n/g, ', ')}`}
          style={{
            padding: spacing.md,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.surfaceMuted,
          }}
        >
          <Stack gap="xs" align="stretch">
            {lines.map((line, i) => (
              <Text
                key={i}
                variant="body"
                color={line.startsWith('=') ? 'primary' : 'secondary'}
                style={theme.typography.amountSmall}
              >
                {line}
              </Text>
            ))}
          </Stack>
        </View>
      </Stack>
    </Card>
  );
}

// We need `View` from react-native for the formula card wrapper —
// imported at the top of this file.

// ---------------------------------------------------------------------------
// Contributions section
// ---------------------------------------------------------------------------

interface ContributionsSectionProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function ContributionsSection({ viewModel }: ContributionsSectionProps): ReactNode {
  if (!viewModel.hasContributions) {
    return (
      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Expense contributions
        </Text>
        <EmptyNoteCard
          icon="receipt-outline"
          title="No expenses yet"
          message="When expenses are added, each one that contributed to this balance will appear here."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Expense contributions
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.contributions.map((c) => (
          <ContributionCard key={c.expenseId} contribution={c} viewModel={viewModel} />
        ))}
      </Stack>
    </Stack>
  );
}

interface ContributionCardProps {
  readonly contribution: ContributionViewModel;
  readonly viewModel: BalanceExplanationViewModel;
}

function ContributionCard({ contribution, viewModel }: ContributionCardProps): ReactNode {
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center">
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary" numberOfLines={1}>
              {contribution.expenseTitle || 'Untitled expense'}
            </Text>
            <Text variant="caption" color="muted">
              {contribution.expenseDate || 'Date unknown'}
            </Text>
          </Stack>
          <AmountText
            amountMinor={contribution.memberNetForExpenseMinor}
            currencyCode={viewModel.currencyCode}
            variant="amountSmall"
            accessibilityLabel={`Net contribution: ${contribution.memberNetForExpenseMinor} ${viewModel.currencyCode}`}
          />
        </Row>
        <Divider />
        <Row gap="md" align="stretch">
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="caption" color="muted">
              You paid
            </Text>
            <AmountText
              amountMinor={contribution.memberPaidMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountSmall"
              showSign={false}
              accessibilityLabel={`You paid: ${contribution.memberPaidMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="caption" color="muted">
              Your share
            </Text>
            <AmountText
              amountMinor={contribution.memberShareMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountSmall"
              showSign={false}
              accessibilityLabel={`Your share: ${contribution.memberShareMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Settlement impacts section
// ---------------------------------------------------------------------------

interface SettlementImpactsSectionProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function SettlementImpactsSection({ viewModel }: SettlementImpactsSectionProps): ReactNode {
  if (!viewModel.hasSettlementImpacts) {
    return (
      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Settlement impact
        </Text>
        <EmptyNoteCard
          icon="swap-horizontal-outline"
          title="No settlements recorded"
          message="When settlements are recorded, each one that affected this balance will appear here."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Settlement impact
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.settlementImpacts.map((s) => (
          <SettlementImpactCard key={s.settlementId} impact={s} viewModel={viewModel} />
        ))}
      </Stack>
    </Stack>
  );
}

interface SettlementImpactCardProps {
  readonly impact: SettlementImpactViewModel;
  readonly viewModel: BalanceExplanationViewModel;
}

function SettlementImpactCard({ impact, viewModel }: SettlementImpactCardProps): ReactNode {
  const theme = useTheme();
  const iconName =
    impact.direction === 'sent'
      ? 'arrow-up-circle'
      : impact.direction === 'received'
        ? 'arrow-down-circle'
        : 'remove-circle-outline';
  const accent =
    impact.direction === 'sent'
      ? theme.colors.negative
      : impact.direction === 'received'
        ? theme.colors.positive
        : theme.colors.textMuted;
  return (
    <Card elevation="sm" padding="lg">
      <Row gap="md" align="center">
        <Icon name={iconName} size={theme.iconSizes.lg} color={accent} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            {impact.date || 'Date unknown'}
          </Text>
          <Text variant="caption" color="muted">
            {impact.impactLabel}
          </Text>
        </Stack>
        <AmountText
          amountMinor={impact.amountMinor}
          currencyCode={viewModel.currencyCode}
          variant="amountSmall"
          showSign={false}
          accessibilityLabel={`Settlement amount: ${impact.amountMinor} ${viewModel.currencyCode}`}
        />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rounding notes section
// ---------------------------------------------------------------------------

interface RoundingNotesSectionProps {
  readonly viewModel: BalanceExplanationViewModel;
}

function RoundingNotesSection({ viewModel }: RoundingNotesSectionProps): ReactNode {
  if (!viewModel.hasRoundingNotes) {
    return null;
  }
  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Rounding notes
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.roundingNotes.map((note) => (
          <RoundingNoteCard key={note.expenseId} note={note} viewModel={viewModel} />
        ))}
      </Stack>
    </Stack>
  );
}

interface RoundingNoteCardProps {
  readonly note: RoundingNoteViewModel;
  readonly viewModel: BalanceExplanationViewModel;
}

function RoundingNoteCard({ note, viewModel }: RoundingNoteCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center">
          <Icon name="calculator-outline" size={theme.iconSizes.md} color={theme.colors.brandPrimary} />
          <Text variant="bodyStrong" color="primary" style={{ flex: 1 }}>
            Expense {note.expenseId}
          </Text>
          <Badge variant="info" label={note.distributionMethod} icon="information-circle-outline" />
        </Row>
        <Row gap="md" align="stretch">
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="caption" color="muted">
              Total
            </Text>
            <AmountText
              amountMinor={note.totalAmountMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountSmall"
              showSign={false}
              accessibilityLabel={`Total: ${note.totalAmountMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="caption" color="muted">
              Sum of splits
            </Text>
            <AmountText
              amountMinor={note.splitSumMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountSmall"
              showSign={false}
              accessibilityLabel={`Splits sum: ${note.splitSumMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="caption" color="muted">
              Remainder
            </Text>
            <AmountText
              amountMinor={note.remainderMinor}
              currencyCode={viewModel.currencyCode}
              variant="amountSmall"
              accessibilityLabel={`Remainder: ${note.remainderMinor} ${viewModel.currencyCode}`}
            />
          </Stack>
        </Row>
        <Text variant="caption" color="muted">
          {note.note}
        </Text>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty note card
// ---------------------------------------------------------------------------

interface EmptyNoteCardProps {
  readonly icon: string;
  readonly title: string;
  readonly message: string;
}

function EmptyNoteCard({ icon, title, message }: EmptyNoteCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="lg" accessibilityRole="text">
      <Stack gap="xs" align="center">
        <Icon name={icon} size={theme.iconSizes.lg} color={theme.colors.textMuted} />
        <Text variant="bodyStrong" color="primary">
          {title}
        </Text>
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          {message}
        </Text>
      </Stack>
    </Card>
  );
}
