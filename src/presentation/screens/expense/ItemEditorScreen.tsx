/**
 * Item-level expense editor.
 *
 * Line items live on the expense aggregate; saving calls the same
 * `UpdateExpenseUseCase` that recomputes splits through `ItemSplitStrategy`.
 * There is no second balance calculator. The screen refuses to save until
 * items + tax − discount reconcile exactly to the expense total.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { ExpenseDetailView } from '@application/expenses/get-expense-detail.usecase';
import type { ExpenseLineItem } from '@domain/entities/expense';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { tryGetAppServices } from '@store/services-registry';

interface Row {
  readonly key: string;
  name: string;
  quantity: string;
  unitPrice: string;
  memberIds: string[];
}

function minorFromInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function inputFromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

function rowTotal(row: Row): number {
  const qty = Number(row.quantity);
  const unit = minorFromInput(row.unitPrice);
  if (!Number.isFinite(qty) || qty <= 0 || unit === null) return 0;
  return Math.round(qty * unit);
}

export default function ItemEditorScreen(): ReactNode {
  const theme = useTheme();
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const expenseId = params.expenseId ?? '';
  const [detail, setDetail] = useState<ExpenseDetailView | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tax, setTax] = useState('0.00');
  const [discount, setDiscount] = useState('0.00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        const result = await services.expenses.getExpenseDetail.execute({
          expenseId: expenseId as never,
        });
        if (cancelled) return;
        const view = result.view;
        setDetail(view);
        const memberIds = [...new Set([...view.shares, ...view.payers].map((m) => m.memberId))];
        if (view.lineItems !== undefined && view.lineItems.length > 0) {
          setRows(
            view.lineItems.map((item, index) => ({
              key: item.id || `row-${index}`,
              name: item.name,
              quantity: String(item.quantity ?? 1),
              unitPrice: inputFromMinor(
                item.unitPriceMinor ?? Math.round(item.totalAmountMinor / (item.quantity ?? 1)),
              ),
              memberIds: [...item.assignedMemberIds],
            })),
          );
        } else {
          setRows([
            {
              key: 'row-0',
              name: view.title,
              quantity: '1',
              unitPrice: inputFromMinor(view.amountMinor),
              memberIds,
            },
          ]);
        }
        const charges = view.itemCharges ?? [];
        const positive = charges
          .filter((charge) => charge.type !== 'discount' && charge.amountMinor > 0)
          .reduce((sum, charge) => sum + charge.amountMinor, 0);
        const negative = charges
          .filter((charge) => charge.type === 'discount' || charge.amountMinor < 0)
          .reduce((sum, charge) => sum + Math.abs(charge.amountMinor), 0);
        setTax(inputFromMinor(positive));
        setDiscount(inputFromMinor(negative));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the expense.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  const updateRow = useCallback((key: string, patch: Partial<Row>): void => {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  if (loading) {
    return (
      <Screen safeArea>
        <ActivityIndicator accessibilityLabel="Loading line items" style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (detail === null) {
    return (
      <Screen safeArea>
        <Text variant="body" color="negative" style={{ padding: spacing.xl }}>
          {error ?? 'Expense not found.'}
        </Text>
      </Screen>
    );
  }

  const members = [...new Set([...detail.shares, ...detail.payers].map((m) => m.memberId))].map(
    (id) => ({
      id,
      name:
        detail.shares.find((share) => share.memberId === id)?.displayName ??
        detail.payers.find((payer) => payer.memberId === id)?.displayName ??
        id,
    }),
  );

  const itemsTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);
  const taxMinor = minorFromInput(tax);
  const discountMinor = minorFromInput(discount);
  const chargesValid = taxMinor !== null && discountMinor !== null;
  const grandTotal = itemsTotal + (taxMinor ?? 0) - (discountMinor ?? 0);
  const difference = detail.amountMinor - grandTotal;
  const invalidRow = rows.some(
    (row) =>
      row.name.trim().length === 0 ||
      row.memberIds.length === 0 ||
      !Number.isFinite(Number(row.quantity)) ||
      Number(row.quantity) <= 0 ||
      minorFromInput(row.unitPrice) === null,
  );
  const canSave = rows.length > 0 && !invalidRow && chargesValid && difference === 0 && !saving;

  const save = (): void => {
    const services = tryGetAppServices();
    if (services === null || !canSave) return;
    setSaving(true);
    setError(null);
    const lineItems: ExpenseLineItem[] = rows.map((row) => ({
      id: row.key,
      name: row.name.trim(),
      quantity: Number(row.quantity),
      unitPriceMinor: minorFromInput(row.unitPrice) ?? 0,
      totalAmountMinor: rowTotal(row),
      assignedMemberIds: row.memberIds,
    }));
    const charges = [
      ...((taxMinor ?? 0) > 0
        ? [{ type: 'tax' as const, amountMinor: taxMinor ?? 0, label: 'Tax / fees' }]
        : []),
      ...((discountMinor ?? 0) > 0
        ? [{ type: 'discount' as const, amountMinor: -(discountMinor ?? 0), label: 'Discount' }]
        : []),
    ];
    void services.expenses.updateExpense
      .execute({
        expenseId: detail.expenseId,
        title: detail.title,
        amountMinor: detail.amountMinor,
        currencyCode: detail.currencyCode,
        expenseDate: detail.expenseDate,
        ...(detail.note !== null ? { note: detail.note } : {}),
        ...(detail.category !== null ? { category: detail.category } : {}),
        payerContributions: detail.payers.map((payer) => ({
          memberId: payer.memberId,
          amountMinor: payer.amountMinor,
        })),
        participantIds: [...new Set(rows.flatMap((row) => row.memberIds))],
        split: { splitType: 'items', lineItems, charges },
        expectedVersion: detail.version ?? 1,
        actorUserId: 'local-user',
      })
      .then(
        () => router.back(),
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not save line items.');
          setSaving(false);
        },
      );
  };

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="md" style={{ padding: spacing.xl }}>
        <Text variant="body" color="secondary">
          Assign each item to the people who shared it. The final total must equal the expense
          amount exactly.
        </Text>

        {rows.map((row, index) => (
          <Card key={row.key}>
            <Stack gap="sm">
              <Row gap="sm" align="center">
                <Text variant="caption" color="muted">
                  Item {index + 1}
                </Text>
                <View style={{ flex: 1 }} />
                {rows.length > 1 ? (
                  <IconButton
                    icon="trash-outline"
                    onPress={() =>
                      setRows((previous) => previous.filter((entry) => entry.key !== row.key))
                    }
                    accessibilityLabel={`Remove item ${index + 1}`}
                  />
                ) : null}
              </Row>
              <TextInput
                value={row.name}
                onChangeText={(value) => updateRow(row.key, { name: value })}
                placeholder="Item name"
                accessibilityLabel={`Item ${index + 1} name`}
                style={inputStyle(theme)}
              />
              <Row gap="sm">
                <View style={{ width: 84 }}>
                  <Text variant="caption" color="muted">
                    Qty
                  </Text>
                  <TextInput
                    value={row.quantity}
                    onChangeText={(value) => updateRow(row.key, { quantity: value })}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Item ${index + 1} quantity`}
                    style={inputStyle(theme)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="muted">
                    Unit price ({detail.currencyCode})
                  </Text>
                  <TextInput
                    value={row.unitPrice}
                    onChangeText={(value) => updateRow(row.key, { unitPrice: value })}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Item ${index + 1} unit price`}
                    style={inputStyle(theme)}
                  />
                </View>
              </Row>
              <Text variant="caption" color="secondary">
                Shared by
              </Text>
              <Row gap="xs" style={{ flexWrap: 'wrap' }}>
                {members.map((member) => {
                  const selected = row.memberIds.includes(member.id);
                  return (
                    <Pressable
                      key={member.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${member.name} for item ${index + 1}`}
                      onPress={() =>
                        updateRow(row.key, {
                          memberIds: selected
                            ? row.memberIds.filter((id) => id !== member.id)
                            : [...row.memberIds, member.id],
                        })
                      }
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 4,
                        borderRadius: theme.borderRadius.full,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.brandPrimary
                          : theme.colors.surface,
                      }}
                    >
                      <Text variant="caption" color={selected ? 'onColor' : 'secondary'}>
                        {member.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </Row>
            </Stack>
          </Card>
        ))}

        <Button
          label="Add item"
          variant="secondary"
          size="sm"
          onPress={() =>
            setRows((previous) => [
              ...previous,
              {
                key: `row-${Date.now()}`,
                name: '',
                quantity: '1',
                unitPrice: '0.00',
                memberIds: members.map((member) => member.id),
              },
            ])
          }
          accessibilityLabel="Add another item"
        />

        <Card>
          <Stack gap="sm">
            <Text variant="cardTitle">Charges</Text>
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  Tax / fees
                </Text>
                <TextInput
                  value={tax}
                  onChangeText={setTax}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Tax and fees"
                  style={inputStyle(theme)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  Discount
                </Text>
                <TextInput
                  value={discount}
                  onChangeText={setDiscount}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Discount"
                  style={inputStyle(theme)}
                />
              </View>
            </Row>
          </Stack>
        </Card>

        <Card>
          <Stack gap={2}>
            <Row gap="sm">
              <Text variant="body" style={{ flex: 1 }}>
                Items + charges
              </Text>
              <Text variant="bodyStrong">{inputFromMinor(grandTotal)}</Text>
            </Row>
            <Row gap="sm">
              <Text variant="body" style={{ flex: 1 }}>
                Expense total
              </Text>
              <Text variant="bodyStrong">{inputFromMinor(detail.amountMinor)}</Text>
            </Row>
            {difference !== 0 ? (
              <Text variant="caption" color="negative">
                Off by {inputFromMinor(Math.abs(difference))} — adjust prices or charges.
              </Text>
            ) : (
              <Text variant="caption" color="positive">
                Reconciles exactly.
              </Text>
            )}
          </Stack>
        </Card>

        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={saving ? 'Saving…' : 'Save items and split'}
          onPress={save}
          disabled={!canSave}
          accessibilityLabel="Save itemised split"
        />
      </Stack>
    </Screen>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  } as const;
}
