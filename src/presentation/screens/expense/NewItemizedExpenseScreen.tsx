/**
 * Item-first expense creation.
 *
 * No placeholder expense. Items, charges and payers are entered together and
 * persisted once through `CreateExpenseManuallyUseCase` with an `items` split,
 * which delegates to the existing ItemSplitStrategy. The expense id is fixed at
 * mount so retries cannot duplicate.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { ExpenseItemCharge, ExpenseLineItem } from '@domain/entities/expense';
import { calculateItemSplit } from '@domain/services/splits';
import { Money } from '@domain/value-objects';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { todayDateOnly } from '@presentation/view-models/expense-form';
import { tryGetAppServices } from '@store/services-registry';

interface Member {
  readonly id: string;
  readonly name: string;
}

interface ItemRow {
  readonly key: string;
  name: string;
  quantity: string;
  unitPrice: string;
  memberIds: string[];
}

interface PayerRow {
  readonly memberId: string;
  amount: string;
}

interface Draft {
  readonly title: string;
  readonly date: string;
  readonly rows: readonly ItemRow[];
  readonly payers: readonly PayerRow[];
  readonly tax: string;
  readonly tip: string;
  readonly service: string;
  readonly discount: string;
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

function minorFrom(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function money(minor: number): string {
  return (minor / 100).toFixed(2);
}

function rowTotal(row: ItemRow): number {
  const qty = Number(row.quantity);
  const unit = minorFrom(row.unitPrice);
  if (!Number.isFinite(qty) || qty <= 0 || unit === null) return 0;
  return Math.round(qty * unit);
}

export default function NewItemizedExpenseScreen(): ReactNode {
  const theme = useTheme();
  const { groupId = '', draftId } = useLocalSearchParams<{ groupId?: string; draftId?: string }>();
  const [groupName, setGroupName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayDateOnly());
  const [rows, setRows] = useState<ItemRow[]>([
    { key: 'item-0', name: '', quantity: '1', unitPrice: '', memberIds: [] },
  ]);
  const [payers, setPayers] = useState<PayerRow[]>([]);
  const [tax, setTax] = useState('0.00');
  const [tip, setTip] = useState('0.00');
  const [service, setService] = useState('0.00');
  const [discount, setDiscount] = useState('0.00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const expenseId = useRef(`itemized-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const draftKey = `billlens.itemized-draft.${groupId}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        const group = await services.groups.get.execute(groupId);
        const result = await services.groups.listGroupMembers.execute(groupId);
        if (cancelled) return;
        setGroupName(group.name);
        setCurrency(group.currencyCode as string);
        setMembers(result.members.map((member) => ({ id: member.id, name: member.displayName })));
        setPayers([{ memberId: result.members[0]?.id ?? '', amount: '0.00' }]);
        setRows((previous) =>
          previous.map((row) => ({
            ...row,
            memberIds: result.members.map((member) => member.id),
          })),
        );

        if (draftId !== undefined && draftId.length > 0) {
          const draft = await services.capture.getDraft.execute(draftId as never);
          if (draft !== null && !cancelled) {
            const memberIds = new Set(result.members.map((member) => member.id as string));
            setTitle(draft.title ?? draft.merchantName ?? '');
            setDate(draft.expenseDate ?? todayDateOnly());
            setRows(
              draft.lineItems.length > 0
                ? draft.lineItems.map((item) => ({
                    key: item.id as string,
                    name: item.name,
                    quantity: String(item.quantity),
                    unitPrice: money(item.unitPriceMinor),
                    memberIds:
                      item.assignedMemberIds.length > 0
                        ? item.assignedMemberIds.map((id) => id as string).filter((id) => memberIds.has(id))
                        : [...memberIds],
                  }))
                : [
                    {
                      key: 'item-0',
                      name: '',
                      quantity: '1',
                      unitPrice: '',
                      memberIds: result.members.map((member) => member.id),
                    },
                  ],
            );
            let nextTax = 0;
            let nextTip = 0;
            let nextService = 0;
            let nextDiscount = 0;
            for (const charge of draft.charges) {
              if (charge.type === 'tax') nextTax += charge.amountMinor;
              else if (charge.type === 'tip') nextTip += charge.amountMinor;
              else if (charge.type === 'service_charge') nextService += charge.amountMinor;
              else if (charge.type === 'discount') nextDiscount += Math.abs(charge.amountMinor);
            }
            setTax(money(nextTax));
            setTip(money(nextTip));
            setService(money(nextService));
            setDiscount(money(nextDiscount));
            setPayers([
              {
                memberId: result.members[0]?.id ?? '',
                amount: money(draft.amountMinor ?? 0),
              },
            ]);
          }
        }

        const saved = await AsyncStorage.getItem(draftKey);
        if (saved !== null && !cancelled && (draftId === undefined || draftId.length === 0)) {
          try {
            const draft = JSON.parse(saved) as Draft;
            setTitle(draft.title);
            setDate(draft.date);
            setRows([...draft.rows]);
            setPayers([...draft.payers]);
            setTax(draft.tax);
            setTip(draft.tip);
            setService(draft.service);
            setDiscount(draft.discount);
          } catch {
            await AsyncStorage.removeItem(draftKey);
          }
        }
        setDraftLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load group.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId, draftKey, groupId]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      const draft: Draft = { title, date, rows, payers, tax, tip, service, discount };
      void AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [draftKey, draftLoaded, title, date, rows, payers, tax, tip, service, discount]);

  const taxMinor = minorFrom(tax) ?? 0;
  const tipMinor = minorFrom(tip) ?? 0;
  const serviceMinor = minorFrom(service) ?? 0;
  const discountMinor = minorFrom(discount) ?? 0;
  const itemsTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);
  const grandTotal = itemsTotal + taxMinor + tipMinor + serviceMinor - discountMinor;
  const payerTotal = payers.reduce((sum, row) => sum + (minorFrom(row.amount) ?? 0), 0);
  const difference = grandTotal - payerTotal;
  const participantIds = useMemo(
    () => [...new Set(rows.flatMap((row) => row.memberIds))],
    [rows],
  );

  const preview = useMemo(() => {
    if (grandTotal <= 0 || participantIds.length === 0) return null;
    const lineItems: ExpenseLineItem[] = rows
      .filter((row) => row.name.trim().length > 0 && row.memberIds.length > 0)
      .map((row) => ({
        id: row.key,
        name: row.name.trim(),
        quantity: Number(row.quantity),
        unitPriceMinor: minorFrom(row.unitPrice) ?? 0,
        totalAmountMinor: rowTotal(row),
        assignedMemberIds: row.memberIds,
      }));
    const charges: ExpenseItemCharge[] = [
      ...(taxMinor > 0 ? [{ type: 'tax' as const, amountMinor: taxMinor }] : []),
      ...(tipMinor > 0 ? [{ type: 'tip' as const, amountMinor: tipMinor }] : []),
      ...(serviceMinor > 0
        ? [{ type: 'service_charge' as const, amountMinor: serviceMinor }]
        : []),
      ...(discountMinor > 0
        ? [{ type: 'discount' as const, amountMinor: -discountMinor }]
        : []),
    ];
    try {
      return calculateItemSplit(
        Money.fromMinor(grandTotal, currency),
        participantIds.map((id) => id as never),
        lineItems.map((item) => ({
          ...item,
          assignedMemberIds: item.assignedMemberIds.map((id) => id as never),
        })),
        charges,
      );
    } catch {
      return null;
    }
  }, [
    currency,
    discountMinor,
    grandTotal,
    participantIds,
    rows,
    serviceMinor,
    taxMinor,
    tipMinor,
  ]);

  const invalidItem = rows.some(
    (row) =>
      row.name.trim().length === 0 ||
      row.memberIds.length === 0 ||
      !Number.isFinite(Number(row.quantity)) ||
      Number(row.quantity) <= 0 ||
      minorFrom(row.unitPrice) === null,
  );
  const canSave =
    !saving &&
    title.trim().length > 0 &&
    rows.length > 0 &&
    !invalidItem &&
    grandTotal > 0 &&
    difference === 0 &&
    preview !== null;

  const updateRow = (key: string, patch: Partial<ItemRow>): void => {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const save = (): void => {
    const services = tryGetAppServices();
    if (services === null || !canSave) return;
    setSaving(true);
    setError(null);
    const lineItems: ExpenseLineItem[] = rows.map((row) => ({
      id: row.key,
      name: row.name.trim(),
      quantity: Number(row.quantity),
      unitPriceMinor: minorFrom(row.unitPrice) ?? 0,
      totalAmountMinor: rowTotal(row),
      assignedMemberIds: row.memberIds,
    }));
    const charges: ExpenseItemCharge[] = [
      ...(taxMinor > 0 ? [{ type: 'tax' as const, amountMinor: taxMinor }] : []),
      ...(tipMinor > 0 ? [{ type: 'tip' as const, amountMinor: tipMinor }] : []),
      ...(serviceMinor > 0
        ? [{ type: 'service_charge' as const, amountMinor: serviceMinor }]
        : []),
      ...(discountMinor > 0
        ? [{ type: 'discount' as const, amountMinor: -discountMinor }]
        : []),
    ];
    void services.expenses.createExpenseManually
      .execute({
        expenseId: expenseId.current,
        groupId,
        title: title.trim(),
        amountMinor: grandTotal,
        currencyCode: currency,
        expenseDate: date,
        payerContributions: payers
          .filter((payer) => (minorFrom(payer.amount) ?? 0) > 0)
          .map((payer) => ({
            memberId: payer.memberId,
            amountMinor: minorFrom(payer.amount) ?? 0,
          })),
        participantIds,
        split: { splitType: 'items', lineItems, charges },
        createdBy: 'local-user',
      })
      .then(
        async () => {
          setDraftLoaded(false);
          await AsyncStorage.removeItem(draftKey).catch(() => undefined);
          router.replace(`/groups/${encodeURIComponent(groupId)}`);
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not save the itemized expense.');
          setSaving(false);
        },
      );
  };

  if (loading) {
    return (
      <Screen safeArea>
        <ActivityIndicator
          style={{ marginTop: spacing.xl }}
          accessibilityLabel="Loading itemized expense"
        />
      </Screen>
    );
  }

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="md" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" accessibilityRole="header">
          {groupName || 'Itemized expense'}
        </Text>
        <Text variant="caption" color="secondary">
          Enter items and charges first; the payer total must match the bill exactly.
        </Text>

        <Text variant="caption" color="muted">
          Title
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Dinner"
          accessibilityLabel="Itemized expense title"
          maxLength={200}
          style={inputStyle(theme)}
        />
        <Text variant="caption" color="muted">
          Date (YYYY-MM-DD)
        </Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          accessibilityLabel="Itemized expense date"
          style={inputStyle(theme)}
        />

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
                <View style={{ width: 90 }}>
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
                    Unit price ({currency})
                  </Text>
                  <TextInput
                    value={row.unitPrice}
                    onChangeText={(value) => updateRow(row.key, { unitPrice: value })}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Item ${index + 1} unit price`}
                    style={inputStyle(theme)}
                  />
                </View>
                <View style={{ justifyContent: 'flex-end', paddingBottom: 12 }}>
                  <Text variant="caption">{money(rowTotal(row))}</Text>
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
                key: `item-${Date.now()}`,
                name: '',
                quantity: '1',
                unitPrice: '',
                memberIds: members.map((member) => member.id),
              },
            ])
          }
          accessibilityLabel="Add item"
        />

        <Card>
          <Stack gap="sm">
            <Text variant="cardTitle">Charges</Text>
            <Row gap="sm">
              <ChargeField label="Tax" value={tax} onChange={setTax} />
              <ChargeField label="Tip" value={tip} onChange={setTip} />
            </Row>
            <Row gap="sm">
              <ChargeField label="Service" value={service} onChange={setService} />
              <ChargeField label="Discount" value={discount} onChange={setDiscount} />
            </Row>
            <Row>
              <Text variant="body" style={{ flex: 1 }}>
                Bill total
              </Text>
              <Text variant="bodyStrong">
                {money(grandTotal)} {currency}
              </Text>
            </Row>
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="cardTitle">Who paid</Text>
            {payers.map((payer, index) => (
              <Row key={payer.memberId} gap="sm" align="center" style={{ flexWrap: 'wrap' }}>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text variant="caption" color="muted">
                    Member
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {members.map((member) => (
                      <Pressable
                        key={member.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: payer.memberId === member.id }}
                        onPress={() =>
                          setPayers((previous) =>
                            previous.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, memberId: member.id } : entry,
                            ),
                          )
                        }
                        style={{
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 4,
                          borderRadius: theme.borderRadius.full,
                          borderWidth: 1,
                          borderColor:
                            payer.memberId === member.id
                              ? theme.colors.brandPrimary
                              : theme.colors.border,
                        }}
                      >
                        <Text
                          variant="caption"
                          color={payer.memberId === member.id ? 'onColor' : 'secondary'}
                        >
                          {member.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Stack>
                <View style={{ width: 100 }}>
                  <Text variant="caption" color="muted">
                    Paid
                  </Text>
                  <TextInput
                    value={payer.amount}
                    onChangeText={(value) =>
                      setPayers((previous) =>
                        previous.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, amount: value } : entry,
                        ),
                      )
                    }
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Payer ${index + 1} amount`}
                    style={inputStyle(theme)}
                  />
                </View>
                {payers.length > 1 ? (
                  <IconButton
                    icon="close-outline"
                    onPress={() =>
                      setPayers((previous) => previous.filter((_, entryIndex) => entryIndex !== index))
                    }
                    accessibilityLabel={`Remove payer ${index + 1}`}
                  />
                ) : null}
              </Row>
            ))}
            <Row gap="sm">
              <Button
                label="Add payer"
                variant="secondary"
                size="sm"
                onPress={() =>
                  setPayers((previous) => {
                    const unused = members.find(
                      (member) => !previous.some((entry) => entry.memberId === member.id),
                    );
                    return unused === undefined
                      ? previous
                      : [...previous, { memberId: unused.id, amount: '0.00' }];
                  })
                }
                accessibilityLabel="Add another payer"
              />
              <Button
                label="Fill remaining"
                variant="ghost"
                size="sm"
                onPress={() =>
                  setPayers((previous) =>
                    previous.map((entry, index) =>
                      index === previous.length - 1
                        ? { ...entry, amount: money(difference + (minorFrom(entry.amount) ?? 0)) }
                        : entry,
                    ),
                  )
                }
                accessibilityLabel="Fill the remaining payer amount"
              />
            </Row>
            <Text variant="caption" color={difference === 0 ? 'positive' : 'negative'}>
              {difference === 0
                ? 'Payer contributions match the bill total.'
                : `Payer total is off by ${money(Math.abs(difference))} ${currency}.`}
            </Text>
          </Stack>
        </Card>

        {preview !== null ? (
          <Card>
            <Stack gap="xs">
              <Text variant="cardTitle">Member preview</Text>
              {preview.entries.map((entry) => {
                const name =
                  members.find((member) => member.id === (entry.memberId as string))?.name ??
                  (entry.memberId as string);
                return (
                  <Row key={entry.memberId as string}>
                    <Text variant="body" style={{ flex: 1 }}>
                      {name}
                    </Text>
                    <Text variant="bodyStrong">{money(entry.amountMinor)}</Text>
                  </Row>
                );
              })}
            </Stack>
          </Card>
        ) : (
          <Text variant="caption" color="warning">
            Assign at least one item participant to preview shares.
          </Text>
        )}

        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={saving ? 'Saving…' : 'Save itemized expense'}
          onPress={save}
          disabled={!canSave}
          accessibilityLabel="Save itemized expense"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={saving}
          accessibilityLabel="Cancel itemized expense"
        />
      </Stack>
    </Screen>
  );
}

function ChargeField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        style={inputStyle(theme)}
      />
    </View>
  );
}
