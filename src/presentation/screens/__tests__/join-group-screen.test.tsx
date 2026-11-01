/**
 * Join group screen tests (v2.26.2).
 *
 * Regression: submitting a valid-looking token navigated back as if the
 * user had joined, although no membership was created (no invite adapter
 * is wired and no relay is deployed). The screen must now report that
 * joining is unavailable and must not navigate.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { JoinGroupScreen, JoinGroupView } from '@presentation/screens/group/JoinGroupScreen';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: (...args: readonly unknown[]) => mockRouterBack(...args) },
}));

const VALID_TOKEN = 'a'.repeat(40);

describe('JoinGroupView notice', () => {
  it('renders the unavailable notice as an alert', () => {
    const { getByText } = render(
      <JoinGroupView
        token={VALID_TOKEN}
        validation={{ isValid: true, error: null, normalized: VALID_TOKEN }}
        showError={false}
        notice="Joining needs the encrypted relay."
        onTokenChange={() => undefined}
        onJoin={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(getByText('Joining needs the encrypted relay.')).toBeTruthy();
  });
});

describe('JoinGroupScreen', () => {
  it('does not pretend to join and does not navigate back', () => {
    mockRouterBack.mockClear();
    const { getByLabelText, getByText } = render(<JoinGroupScreen />);

    fireEvent.changeText(getByLabelText('Invite token or link'), VALID_TOKEN);
    fireEvent.press(getByLabelText('Join the group'));

    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(getByText(/no group was joined/i)).toBeTruthy();
  });

  it('clears the notice when the token changes', () => {
    const { getByLabelText, getByText, queryByText } = render(<JoinGroupScreen />);

    fireEvent.changeText(getByLabelText('Invite token or link'), VALID_TOKEN);
    fireEvent.press(getByLabelText('Join the group'));
    expect(getByText(/no group was joined/i)).toBeTruthy();

    fireEvent.changeText(getByLabelText('Invite token or link'), `${VALID_TOKEN}b`);
    expect(queryByText(/no group was joined/i)).toBeNull();
  });
});
