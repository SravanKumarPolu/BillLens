/**
 * DraftReviewScreen (Prompt 18) — the most important screen in BillLens.
 *
 * Where the user confirms extracted financial details before a final
 * expense is created. Every editable field is shown with a confidence
 * indicator (StatusDot + plain-language label — colour is NEVER the
 * sole signal) and a list of FieldReviewIssues gates the Confirm
 * button (blocking issues must be resolved first).
 *
 * Layout (scrollable):
 *   1. Source preview thumbnail (when the draft came from a capture)
 *   2. Merchant + title — editable TextInputs with confidence indicators
 *   3. Date — tappable field with confidence indicator
 *   4. Currency — tappable field with confidence indicator
 *   5. Subtotal + charges — list of DraftCharge cards
 *   6. Total — large AmountText with confidence indicator (highlighted on mismatch)
 *   7. Line items — cards with name / qty / unit price / total / assignment
 *   8. Payer — member picker
 *   9. Participants — list of avatars with checkboxes
 *  10. Split method — pills (Equal / Exact / Percentage / Shares / Items)
 *  11. Issues — list of FieldReviewIssue cards with severity + Resolve button
 *  12. Confirm button — disabled when blocking issues exist
 *
 * Phase 2: there is no real capture pipeline yet, so the screen reads
 * the draft from `useDraftStore` (which starts empty). The container
 * falls back to an empty-state view model so the screen renders
 * legitimate zero-data UI when no draft is loaded.
 *
 * Phase 2 → v2.4.0: the capture pipeline now persists drafts, and the
 * confirm flow runs the REAL use cases: the edited draft is saved
 * (optimistic-concurrency guarded) and confirmed atomically through
 * `CreateExpenseFromDraftUseCase` (version-guarded + idempotent — a
 * double-tap cannot create two expenses). The screen also hydrates a
 * persisted draft by id when the store is empty (deep links / restart).
 *
 * Architecture:
 *   - The thin container `DraftReviewScreen` reads `useDraftStore` and
 *     builds a `DraftReviewViewModel` via `createDraftReviewViewModel`.
 *   - The pure presentational component `DraftReviewView` reads ONLY
 *     from the view model + a set of callbacks. No business logic.
 */

import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, TextInput, View } from 'react-native';


import { AmountText } from '@presentation/design-system/components/AmountText';
import { Avatar } from '@presentation/design-system/components/Avatar';
import { Badge } from '@presentation/design-system/components/Badge';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Divider } from '@presentation/design-system/components/Divider';
import { Icon } from '@presentation/design-system/components/Icon';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { StatusDot } from '@presentation/design-system/components/StatusDot';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  type DraftReviewViewModel,
  type FieldConfidenceViewModel,
  type IssueViewModel,
  type LineItemViewModel,
  type ChargeViewModel,
  confidenceLevelLabel,
  createDraftReviewViewModel,
  issueSeverityLabel,
  issueTypeIcon,
} from '@presentation/view-models/draft-review';
import { useDraftStore } from '@store/draft-store';
import { useNavigationStore } from '@store/navigation-store';
import { getOcrProviderMode, tryGetAppServices, useAppServicesReady } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPLIT_METHODS: readonly string[] = ['Equal', 'Exact', 'Percentage', 'Shares', 'Items'];

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface DraftReviewScreenProps {
  readonly draftId: string;
  /**
   * Optional override used by tests to inject a synthetic draft without
   * touching the store. When omitted, the screen reads `useDraftStore`.
   */
  readonly draftOverride?: Parameters<typeof createDraftReviewViewModel>[0]['draft'];
  /**
   * Optional override for the source image URI (Phase 2: the screen
   * cannot resolve a CaptureSource from its id yet, so tests pass a
   * URI directly).
   */
  readonly sourceImageUri?: string;
  /**
   * Override for the DEMO banner (tests). When omitted the container
   * derives it from the active OCR provider mode — shown only when the
   * draft was produced by the on-device mock processor, whose results
   * are sample data, never a real scan. (v2.5.0)
   */
  readonly mockOcrBannerOverride?: boolean;
}

export function DraftReviewScreen({
  draftId,
  draftOverride,
  sourceImageUri,
  mockOcrBannerOverride,
}: DraftReviewScreenProps): JSX.Element {
  const storeDraft = useDraftStore((s) => s.currentDraft);
  const updateField = useDraftStore((s) => s.updateField);
  const setCurrentDraft = useDraftStore((s) => s.setCurrentDraft);
  const setHasUnsavedChanges = useDraftStore((s) => s.setHasUnsavedChanges);
  const setHasUnsavedDraftChanges = useNavigationStore(
    (s) => s.setHasUnsavedDraftChanges,
  );

  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [splitMethod, setSplitMethod] = useState<string>('Equal');
  const [confirming, setConfirming] = useState(false);
  const confirmAttemptRef = useRef(0);

  // Hydrate a persisted draft by id when the store is empty (deep link,
  // app restart, duplicate-scan routing). Idempotent — only loads when the
  // store has no draft OR holds a different one.
  const servicesReady = useAppServicesReady();
  useEffect(() => {
    if (draftOverride !== undefined) return;
    if (storeDraft !== null && (storeDraft.id as string) === draftId) return;
    if (!servicesReady) return;
    const services = tryGetAppServices();
    if (services === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const persisted = await services.capture.getDraft.execute(draftId as never);
        if (cancelled || persisted === null) return;
        // Only surface drafts that are still reviewable.
        if (persisted.status === 'confirmed' || persisted.status === 'discarded') return;
        if ((persisted.id as string) === draftId) {
          setCurrentDraft(persisted);
        }
      } catch {
        // Hydration failure leaves the existing empty-state view; the
        // user can still find the draft from the group screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, draftOverride, storeDraft, servicesReady, setCurrentDraft]);

  const draft = draftOverride ?? storeDraft;

  // v2.5.0: label mock-OCR results as DEMO data. In production builds the
  // mock provider can never be selected (see ocr-provider-selector), so
  // this banner is by construction a development/staging-only affordance.
  const showMockOcrBanner =
    mockOcrBannerOverride ?? getOcrProviderMode() === 'mock';

  const viewModel = useMemo(() => {
    if (!draft) return null;
    return createDraftReviewViewModel({
      draft,
      editedFields,
      splitMethod,
    });
  }, [draft, editedFields, splitMethod]);

  if (!draft || !viewModel) {
    return <EmptyDraftView draftId={draftId} />;
  }

  const handleFieldEdit = (field: string, value: unknown): void => {
    updateField(field, value);
    setEditedFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    setHasUnsavedChanges(true);
    setHasUnsavedDraftChanges(true);
  };

  const handleDiscard = (): void => {
    Alert.alert(
      'Discard draft?',
      'Your edits to this draft will be lost. The captured image is preserved so you can re-run extraction.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setCurrentDraft(null);
            setHasUnsavedChanges(false);
            setHasUnsavedDraftChanges(false);
            router.back();
          },
        },
      ],
    );
  };

  const handleConfirm = (): void => {
    if (!viewModel.canConfirm) return;
    if (draftOverride !== undefined) {
      // Test harness: no persistence layer — keep the old store-only
// behaviour so view tests remain deterministic.
      setCurrentDraft(null);
      setHasUnsavedChanges(false);
      setHasUnsavedDraftChanges(false);
      router.back();
      return;
    }

    const services = tryGetAppServices();
    if (services === null || confirming) return;

    // Guard against double-submission: the attempt token makes a second
    // tap a no-op, and the use case's version check is the durable guard.
    const attempt = confirmAttemptRef.current + 1;
    confirmAttemptRef.current = attempt;
    setConfirming(true);

    void (async () => {
      try {
        // 1. Persist the user's edits (version-guarded).
        await services.capture.saveDraftReview.execute({
          draft,
          expectedVersion: draft.version,
        });
        // 2. Atomically confirm the draft → Expense (idempotent; the
        //    version check rejects a replayed confirmation).
        if (draft.groupId === undefined) {
          throw new Error(
            'This receipt is not linked to a group yet. Select a group before confirming.',
          );
        }
        const result = await services.capture.createExpenseFromDraft.execute({
          draftId: draft.id,
          groupId: draft.groupId as string,
          // The persisted draft is at `draft.version` (saveDraftReview
          // persists the entity at its CURRENT version; the confirm
          // transition is what bumps it). The version guard makes a
          // replayed/double confirmation fail loudly instead of duping.
          expectedVersion: draft.version,
        });
        if (attempt !== confirmAttemptRef.current) return; // stale attempt
        setCurrentDraft(null);
        setHasUnsavedChanges(false);
        setHasUnsavedDraftChanges(false);
        Alert.alert('Expense saved', 'The expense was added to the group.', [
          { text: 'OK', onPress: () => router.replace(`/groups/${draft.groupId as string}`) },
        ]);
        void result;
      } catch (error) {
        if (attempt !== confirmAttemptRef.current) return;
        const message =
          error instanceof Error ? error.message : 'Could not save the expense. Please retry.';
        Alert.alert('Could not save expense', message, [{ text: 'OK' }]);
      } finally {
        if (attempt === confirmAttemptRef.current) setConfirming(false);
      }
    })();
  };

  const handleResolveIssue = (issue: IssueViewModel): void => {
    // Phase 2 stub — removing the issue from the draft's unresolvedIssues
    // list. The real flow updates the underlying field and asks the
    // pipeline to re-run its review pass.
    const remaining = draft.unresolvedIssues.filter((i) => i.id !== issue.id);
    handleFieldEdit('unresolvedIssues', remaining);
  };

  return (
    <DraftReviewView
      viewModel={viewModel}
      sourceImageUri={sourceImageUri}
      mockOcrBanner={showMockOcrBanner}
      confirming={confirming}
      onTitleChange={(v) => handleFieldEdit('title', v)}
      onMerchantChange={(v) => handleFieldEdit('merchantName', v)}
      onDateChange={(v) => handleFieldEdit('expenseDate', v)}
      onCurrencyChange={(v) => handleFieldEdit('currencyCode', v)}
      onSplitMethodChange={setSplitMethod}
      onResolveIssue={handleResolveIssue}
      onDiscard={handleDiscard}
      onConfirm={handleConfirm}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface DraftReviewViewProps {
  readonly viewModel: DraftReviewViewModel;
  readonly sourceImageUri?: string;
  /** True while the save+confirm use cases are in flight. */
  readonly confirming?: boolean;
  /**
   * True when the draft came from the on-device MOCK OCR processor —
   * renders an explicit "Demo data" banner so sample extraction values
   * are never mistaken for a real scan of the user's receipt. (v2.5.0)
   */
  readonly mockOcrBanner?: boolean;
  readonly onTitleChange: (value: string) => void;
  readonly onMerchantChange: (value: string) => void;
  readonly onDateChange: (value: string) => void;
  readonly onCurrencyChange: (value: string) => void;
  readonly onSplitMethodChange: (method: string) => void;
  readonly onResolveIssue: (issue: IssueViewModel) => void;
  readonly onDiscard: () => void;
  readonly onConfirm: () => void;
}

export function DraftReviewView({
  viewModel,
  sourceImageUri,
  confirming = false,
  mockOcrBanner = false,
  onTitleChange,
  onMerchantChange,
  onDateChange,
  onCurrencyChange,
  onSplitMethodChange,
  onResolveIssue,
  onDiscard,
  onConfirm,
}: DraftReviewViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <Header onDiscard={onDiscard} />

        {mockOcrBanner ? <MockOcrBanner /> : null}

        {viewModel.hasImageSource && sourceImageUri ? (
          <SourcePreview uri={sourceImageUri} />
        ) : null}

        <MerchantAndTitleSection
          viewModel={viewModel}
          onTitleChange={onTitleChange}
          onMerchantChange={onMerchantChange}
        />

        <DateAndCurrencySection
          viewModel={viewModel}
          onDateChange={onDateChange}
          onCurrencyChange={onCurrencyChange}
        />

        <ChargesSection viewModel={viewModel} />

        <TotalSection viewModel={viewModel} />

        <LineItemsSection viewModel={viewModel} />

        <PayerSection viewModel={viewModel} />

        <ParticipantsSection viewModel={viewModel} />

        <SplitMethodSection
          viewModel={viewModel}
          onSplitMethodChange={onSplitMethodChange}
        />

        <IssuesSection viewModel={viewModel} onResolveIssue={onResolveIssue} />

        <ConfirmSection viewModel={viewModel} onConfirm={onConfirm} confirming={confirming} />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Empty state (no draft loaded)
// ---------------------------------------------------------------------------

interface EmptyDraftViewProps {
  readonly draftId: string;
}

function EmptyDraftView({ draftId }: EmptyDraftViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" color="primary" accessibilityRole="header">
          Review draft
        </Text>
        <Card elevation="sm" padding="lg">
          <Stack gap="sm" align="center">
            <Text variant="bodyStrong" color="primary">
              No draft loaded
            </Text>
            <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
              Draft {draftId} is not in the local store. Capture a receipt to create a
              new draft for review.
            </Text>
          </Stack>
        </Card>
        <Button
          label="Back"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Go back from the empty draft review screen"
        />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Header (with Discard button)
// ---------------------------------------------------------------------------

interface HeaderProps {
  readonly onDiscard: () => void;
}

function Header({ onDiscard }: HeaderProps): ReactNode {
  return (
    <Row gap="sm" align="center">
      <Text variant="screenTitle" color="primary" accessibilityRole="header" style={{ flex: 1 }}>
        Review draft
      </Text>
      <Button
        label="Discard"
        variant="ghost"
        size="sm"
        onPress={onDiscard}
        accessibilityLabel="Discard this draft (with confirmation)"
        icon="trash-outline"
      />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Mock-OCR demo banner (v2.5.0) — labels sample extraction data as DEMO.
// Shown only when the draft came from the on-device mock processor,
// which production builds can never select (see ocr-provider-selector).
// ---------------------------------------------------------------------------

function MockOcrBanner(): ReactNode {
  const theme = useTheme();
  return (
    <Card
      elevation="none"
      padding="md"
      accessibilityRole="text"
      accessibilityLabel="Demo data. This draft was filled with sample scan data for development. It is not from your receipt."
      style={{ borderColor: theme.colors.warning, borderWidth: 1, borderStyle: 'dashed' }}
    >
      <Row gap="sm" align="center">
        <Icon name="flask-outline" size={theme.iconSizes.md} color={theme.colors.warning} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="caption" color="primary">
            Demo data — sample scan, not your receipt
          </Text>
          <Text variant="caption" color="secondary">
            Receipt scanning is running in mock mode. Verify or replace every value before saving.
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Source preview
// ---------------------------------------------------------------------------

interface SourcePreviewProps {
  readonly uri: string;
}

function SourcePreview({ uri }: SourcePreviewProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="sm">
      <Stack gap="xs" align="stretch">
        <Text variant="label" color="secondary">
          Source image
        </Text>
        <View
          accessibilityLabel="Receipt source image preview"
          style={{
            borderRadius: theme.borderRadius.md,
            overflow: 'hidden',
            height: 160,
            backgroundColor: theme.colors.surfaceMuted,
          }}
        >
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
          />
        </View>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Merchant + title
// ---------------------------------------------------------------------------

interface MerchantAndTitleSectionProps {
  readonly viewModel: DraftReviewViewModel;
  readonly onTitleChange: (value: string) => void;
  readonly onMerchantChange: (value: string) => void;
}

function MerchantAndTitleSection({
  viewModel,
  onTitleChange,
  onMerchantChange,
}: MerchantAndTitleSectionProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Merchant and title
        </Text>
        <FieldRow label="Title" confidence={viewModel.titleConfidence}>
          <TextInput
            value={viewModel.title}
            onChangeText={onTitleChange}
            placeholder="Add a title"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Edit the draft title"
            style={[
              theme.typography.input,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 4 },
            ]}
          />
        </FieldRow>
        <FieldRow label="Merchant" confidence={viewModel.merchantConfidence}>
          <TextInput
            value={viewModel.merchantName}
            onChangeText={onMerchantChange}
            placeholder="Add a merchant"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Edit the merchant name"
            style={[
              theme.typography.input,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 4 },
            ]}
          />
        </FieldRow>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Field row with confidence indicator (label + dot — never colour alone)
// ---------------------------------------------------------------------------

interface FieldRowProps {
  readonly label: string;
  readonly confidence: FieldConfidenceViewModel;
  readonly children: ReactNode;
}

function FieldRow({ label, confidence, children }: FieldRowProps): ReactNode {
  return (
    <Stack gap="xs" align="stretch">
      <Row gap="sm" align="center">
        <Text variant="caption" color="muted" style={{ flex: 1 }}>
          {label}
        </Text>
        {confidence.isEdited ? (
          <Badge variant="info" label="Edited" icon="create-outline" />
        ) : null}
        <StatusDot variant={dotVariantFor(confidence.level)} />
        <Text variant="caption" color="muted">
          {confidenceLevelLabel(confidence.level)}
        </Text>
      </Row>
      <Row gap="sm" align="center">
        {children}
      </Row>
    </Stack>
  );
}

function dotVariantFor(
  level: FieldConfidenceViewModel['level'],
): ComponentProps<typeof StatusDot>['variant'] {
  switch (level) {
    case 'high':
      return 'confidenceHigh';
    case 'medium':
      return 'confidenceMedium';
    case 'low':
      return 'confidenceLow';
    case 'unknown':
    default:
      return 'confidenceUnknown';
  }
}

// ---------------------------------------------------------------------------
// Date + currency
// ---------------------------------------------------------------------------

interface DateAndCurrencySectionProps {
  readonly viewModel: DraftReviewViewModel;
  readonly onDateChange: (value: string) => void;
  readonly onCurrencyChange: (value: string) => void;
}

function DateAndCurrencySection({
  viewModel,
  onDateChange,
  onCurrencyChange,
}: DateAndCurrencySectionProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <FieldRow label="Date" confidence={viewModel.dateConfidence}>
          <TextInput
            value={viewModel.expenseDate}
            onChangeText={onDateChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Edit the expense date"
            style={[
              theme.typography.input,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 4 },
            ]}
          />
        </FieldRow>
        <FieldRow label="Currency" confidence={viewModel.currencyConfidence}>
          <TextInput
            value={viewModel.currencyCode}
            onChangeText={onCurrencyChange}
            placeholder="USD"
            placeholderTextColor={theme.colors.textMuted}
            maxLength={3}
            autoCapitalize="characters"
            accessibilityLabel="Edit the currency code"
            style={[
              theme.typography.input,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: 4 },
            ]}
          />
        </FieldRow>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Charges (subtotal + per-charge rows)
// ---------------------------------------------------------------------------

interface ChargesSectionProps {
  readonly viewModel: DraftReviewViewModel;
}

function ChargesSection({ viewModel }: ChargesSectionProps): ReactNode {
  if (!viewModel.hasCharges) return null;
  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Charges
      </Text>
      <Card elevation="sm" padding="lg">
        <Stack gap="sm" align="stretch">
          {viewModel.charges.map((charge) => (
            <ChargeRow key={charge.id} charge={charge} currencyCode={viewModel.currencyCode} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

interface ChargeRowProps {
  readonly charge: ChargeViewModel;
  readonly currencyCode: string;
}

function ChargeRow({ charge, currencyCode }: ChargeRowProps): ReactNode {
  return (
    <Row gap="sm" align="center">
      <StatusDot variant={dotVariantFor(charge.confidenceLevel)} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="body" color="primary">
          {charge.label}
        </Text>
        <Text variant="caption" color="muted">
          {confidenceLevelLabel(charge.confidenceLevel)}
        </Text>
      </Stack>
      {charge.isEdited ? (
        <Badge variant="info" label="Edited" icon="create-outline" />
      ) : null}
      <AmountText
        amountMinor={charge.amountMinor}
        currencyCode={currencyCode}
        variant="amountSmall"
        showSign={false}
        accessibilityLabel={`${charge.label}: ${charge.amountMinor} ${currencyCode}`}
      />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Total (highlighted on mismatch)
// ---------------------------------------------------------------------------

interface TotalSectionProps {
  readonly viewModel: DraftReviewViewModel;
}

function TotalSection({ viewModel }: TotalSectionProps): ReactNode {
  const theme = useTheme();
  const highlighted = viewModel.totalMismatch;
  return (
    <Card
      elevation={highlighted ? 'md' : 'sm'}
      padding="lg"
      style={
        highlighted
          ? { borderColor: theme.colors.negative, borderWidth: 2 }
          : undefined
      }
    >
      <Stack gap="xs" align="stretch">
        <Row gap="sm" align="center">
          <Text variant="label" color="secondary" style={{ flex: 1 }}>
            Total
          </Text>
          <StatusDot variant={dotVariantFor(viewModel.totalConfidenceLevel)} />
          <Text variant="caption" color="muted">
            {confidenceLevelLabel(viewModel.totalConfidenceLevel)}
          </Text>
        </Row>
        <AmountText
          amountMinor={viewModel.totalAmountMinor}
          currencyCode={viewModel.currencyCode}
          variant="amountLarge"
          accessibilityLabel={`Total: ${viewModel.totalAmountMinor} ${viewModel.currencyCode}`}
        />
        {highlighted ? (
          <Row gap="xs" align="center">
            <Icon name="warning-outline" size={theme.iconSizes.sm} color={theme.colors.negative} />
            <Text variant="caption" color="negative">
              The computed subtotal does not match the total. Resolve before confirming.
            </Text>
          </Row>
        ) : null}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

interface LineItemsSectionProps {
  readonly viewModel: DraftReviewViewModel;
}

function LineItemsSection({ viewModel }: LineItemsSectionProps): ReactNode {
  if (!viewModel.hasLineItems) return null;
  return (
    <Stack gap="md" align="stretch">
      <Text variant="sectionTitle" color="primary" accessibilityRole="header">
        Line items
      </Text>
      <Stack gap="md" align="stretch">
        {viewModel.lineItems.map((item) => (
          <LineItemCard
            key={item.id}
            item={item}
            currencyCode={viewModel.currencyCode}
          />
        ))}
      </Stack>
    </Stack>
  );
}

interface LineItemCardProps {
  readonly item: LineItemViewModel;
  readonly currencyCode: string;
}

function LineItemCard({ item, currencyCode }: LineItemCardProps): ReactNode {
  const unassigned = item.assignedMemberIds.length === 0;
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center">
          <StatusDot variant={dotVariantFor(item.confidenceLevel)} />
          <Text variant="bodyStrong" color="primary" style={{ flex: 1 }} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isEdited ? (
            <Badge variant="info" label="Edited" icon="create-outline" />
          ) : null}
          <IconButton
            icon="create-outline"
            onPress={() => {}}
            size="sm"
            variant="ghost"
            accessibilityLabel={`Edit line item ${item.name}`}
          />
        </Row>
        <Row gap="md" align="center">
          <Text variant="caption" color="muted" style={{ flex: 1 }}>
            Qty {item.quantity} × {item.unitPriceMinor} {currencyCode}
          </Text>
          <AmountText
            amountMinor={item.totalAmountMinor}
            currencyCode={currencyCode}
            variant="amountSmall"
            showSign={false}
            accessibilityLabel={`${item.name} total: ${item.totalAmountMinor} ${currencyCode}`}
          />
        </Row>
        <Divider />
        <Row gap="sm" align="center">
          {unassigned ? (
            <Badge variant="warning" label="Unassigned" icon="person-outline" />
          ) : (
            <Row gap="xs" align="center">
              {item.assignedMemberIds.slice(0, 4).map((id) => (
                <Avatar key={id} name={id} size="sm" accessibilityLabel={`Assigned to ${id}`} />
              ))}
              {item.assignedMemberIds.length > 4 ? (
                <Text variant="caption" color="muted">
                  +{item.assignedMemberIds.length - 4}
                </Text>
              ) : null}
            </Row>
          )}
          <Text variant="caption" color="muted" style={{ marginLeft: 'auto' }}>
            {confidenceLevelLabel(item.confidenceLevel)}
          </Text>
        </Row>
        {unassigned ? (
          <Text variant="caption" color="warning">
            Assign at least one member to this item before confirming.
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payer
// ---------------------------------------------------------------------------

interface PayerSectionProps {
  readonly viewModel: DraftReviewViewModel;
}

function PayerSection({ viewModel }: PayerSectionProps): ReactNode {
  const theme = useTheme();
  const payer = viewModel.payerMemberId;
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="label" color="secondary">
          Payer
        </Text>
        {payer === null ? (
          <Pressable
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Select a payer for this expense"
          >
            <Row gap="sm" align="center">
              <Icon name="person-add-outline" size={theme.iconSizes.md} color={theme.colors.brandPrimary} />
              <Text variant="body" color="primary">
                Select payer
              </Text>
            </Row>
          </Pressable>
        ) : (
          <Row gap="sm" align="center">
            <Avatar name={payer} size="md" accessibilityLabel={`Payer: ${payer}`} />
            <Text variant="bodyStrong" color="primary" style={{ flex: 1 }}>
              {payer}
            </Text>
          </Row>
        )}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

interface ParticipantsSectionProps {
  readonly viewModel: DraftReviewViewModel;
}

function ParticipantsSection({ viewModel }: ParticipantsSectionProps): ReactNode {
  if (viewModel.participantIds.length === 0) {
    return (
      <Card elevation="sm" padding="lg">
        <Stack gap="xs" align="stretch">
          <Text variant="label" color="secondary">
            Participants
          </Text>
          <Text variant="caption" color="muted">
            No participants selected yet. Add at least one member before confirming.
          </Text>
        </Stack>
      </Card>
    );
  }
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="label" color="secondary">
          Participants
        </Text>
        <Row gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
          {viewModel.participantIds.map((id) => (
            <Row key={id} gap="xs" align="center">
              <Avatar name={id} size="sm" accessibilityLabel={`Participant: ${id}`} />
              <Text variant="caption" color="primary">
                {id}
              </Text>
            </Row>
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Split method
// ---------------------------------------------------------------------------

interface SplitMethodSectionProps {
  readonly viewModel: DraftReviewViewModel;
  readonly onSplitMethodChange: (method: string) => void;
}

function SplitMethodSection({
  viewModel,
  onSplitMethodChange,
}: SplitMethodSectionProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="sm" align="stretch">
        <Text variant="label" color="secondary">
          Split method
        </Text>
        <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
          {SPLIT_METHODS.map((method) => {
            const active = viewModel.splitMethod.toLowerCase() === method.toLowerCase();
            return (
              <Pressable
                key={method}
                onPress={() => onSplitMethodChange(method)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${method} split method`}
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: theme.borderRadius.full,
                  backgroundColor: active
                    ? theme.colors.brandPrimary
                    : theme.colors.surfaceMuted,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
                  minHeight: 32,
                }}
              >
                <Text
                  variant="label"
                  color={active ? 'onColor' : 'secondary'}
                >
                  {method}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

interface IssuesSectionProps {
  readonly viewModel: DraftReviewViewModel;
  readonly onResolveIssue: (issue: IssueViewModel) => void;
}

function IssuesSection({ viewModel, onResolveIssue }: IssuesSectionProps): ReactNode {
  if (!viewModel.hasIssues) return null;
  return (
    <Stack gap="md" align="stretch">
      <Row gap="sm" align="center">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Issues to review
        </Text>
        {viewModel.blockingIssueCount > 0 ? (
          <Badge
            variant="negative"
            label={`${viewModel.blockingIssueCount} blocking`}
            icon="alert-circle-outline"
          />
        ) : null}
      </Row>
      <Stack gap="md" align="stretch">
        {viewModel.issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onResolve={() => onResolveIssue(issue)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

interface IssueCardProps {
  readonly issue: IssueViewModel;
  readonly onResolve: () => void;
}

function IssueCard({ issue, onResolve }: IssueCardProps): ReactNode {
  const theme = useTheme();
  const accentColor =
    issue.severity === 'error'
      ? theme.colors.negative
      : issue.severity === 'warning'
        ? theme.colors.warning
        : theme.colors.info;

  return (
    <Card
      elevation="sm"
      padding="lg"
      style={
        issue.isBlocking
          ? { borderColor: theme.colors.negative, borderWidth: 1 }
          : undefined
      }
    >
      <Stack gap="sm" align="stretch">
        <Row gap="sm" align="center">
          <Icon name={issueTypeIcon(issue.type)} size={theme.iconSizes.md} color={accentColor} />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color="primary">
              {issue.fieldName}
            </Text>
            <Text variant="caption" color="muted">
              {issueSeverityLabel(issue.severity)}
            </Text>
          </Stack>
          <StatusDot
            variant={
              issue.severity === 'error'
                ? 'syncFailed'
                : issue.severity === 'warning'
                  ? 'syncPending'
                  : 'syncComplete'
            }
          />
        </Row>
        <Text variant="body" color="secondary">
          {issue.message}
        </Text>
        {issue.suggestedValueLabel ? (
          <Text variant="caption" color="muted">
            Suggested fix: {issue.suggestedValueLabel}
          </Text>
        ) : null}
        <Button
          label="Resolve"
          variant="secondary"
          size="sm"
          onPress={onResolve}
          accessibilityLabel={`Resolve issue: ${issue.message}`}
          icon="checkmark-outline"
        />
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confirm section
// ---------------------------------------------------------------------------

interface ConfirmSectionProps {
  readonly viewModel: DraftReviewViewModel;
  readonly onConfirm: () => void;
  /** True while the save+confirm use cases are in flight (disables double-taps). */
  readonly confirming?: boolean;
}

function ConfirmSection({ viewModel, onConfirm, confirming = false }: ConfirmSectionProps): ReactNode {
  return (
    <Stack gap="sm" align="stretch">
      <Button
        label={
          confirming
            ? 'Saving…'
            : viewModel.canConfirm
              ? 'Confirm Expense'
              : `Resolve ${viewModel.blockingIssueCount} blocking issue${viewModel.blockingIssueCount === 1 ? '' : 's'}`
        }
        variant="primary"
        size="lg"
        loading={confirming}
        disabled={!viewModel.canConfirm || confirming}
        onPress={onConfirm}
        accessibilityLabel={
          confirming
            ? 'Saving the expense'
            : viewModel.canConfirm
              ? 'Confirm the draft and create the expense'
              : `Confirm is disabled — ${viewModel.blockingIssueCount} blocking issue${viewModel.blockingIssueCount === 1 ? '' : 's'} must be resolved first`
        }
        icon="checkmark-circle-outline"
      />
      {!viewModel.canConfirm ? (
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          The Confirm button is disabled until every blocking issue is resolved.
        </Text>
      ) : null}
    </Stack>
  );
}
