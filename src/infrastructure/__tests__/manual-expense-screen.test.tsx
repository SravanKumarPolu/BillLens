/**
 * Manual expense — screen-to-SQLite integration.
 *
 * Drives the real container (no view mocks) against the in-memory
 * repository graph. Catches form/wiring regressions that use-case tests
 * cannot see, which is where the device "save does nothing" report sits.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { NewExpenseScreen } from '@presentation/screens/expense/NewExpenseScreen';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';
import { useGroupStore } from '@store/group-store';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
  },
  useLocalSearchParams: () => ({}),
}));

const GROUP = 'g_manual_ui';
const MEMBERS = ['m_owner', 'm_asha', 'm_ravi', 'm_meera'] as const;

let database: InMemoryDatabase;

beforeEach(async () => {
  jest.clearAllMocks();
  useGroupStore.getState().reset();
  database = new InMemoryDatabase();
  await runMigrations(database);
  const services = createCompositionRoot({ database });
  await services.groups.createGroup.execute({
    groupId: GROUP,
    name: 'Manual UI',
    currencyCode: 'INR',
    createdBy: 'local-user',
    ownerMemberId: MEMBERS[0],
  });
  for (const id of MEMBERS.slice(1)) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP as never,
        displayName: id,
        role: 'member',
      }),
    );
  }
  setAppServicesForTesting(services);
});

afterEach(() => {
  resetAppServices();
  useGroupStore.getState().reset();
});

describe('manual expense screen', () => {
  it('saves ₹100 equally across four members and persists it', async () => {
    const { getByLabelText, getByText } = render(<NewExpenseScreen groupId={GROUP} />);

    await waitFor(() => expect(getByLabelText('Expense title')).toBeTruthy());
    fireEvent.changeText(getByLabelText('Expense title'), 'Lunch');
    fireEvent.changeText(getByLabelText('Expense amount'), '100');
    fireEvent.press(getByText('Save expense'));

    await waitFor(async () => {
      const rows = await database.all<{ id: string }>(
        'select id from expenses where group_id = ?',
        [GROUP],
      );
      expect(rows).toHaveLength(1);
    });

    const expense = await database.get<{ id: string; amount_minor: number }>(
      'select id, amount_minor from expenses where group_id = ?',
      [GROUP],
    );
    expect(expense?.amount_minor).toBe(10_000);

    const splits = await database.all<{ amount_minor: number }>(
      'select amount_minor from expense_splits where expense_id = ?',
      [expense?.id ?? ''],
    );
    expect(splits.map((split) => split.amount_minor).sort((a, b) => a - b)).toEqual([
      2_500, 2_500, 2_500, 2_500,
    ]);
    expect(mockBack).toHaveBeenCalled();
  }, 20_000);
});
