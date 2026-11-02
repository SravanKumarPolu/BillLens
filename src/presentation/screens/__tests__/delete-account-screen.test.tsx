import { Alert } from 'react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { DeleteAccountScreen } from '@presentation/screens/settings/DeleteAccountScreen';

describe('DeleteAccountScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows executor failures instead of leaving an unhandled rejection', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Yes, delete everything')?.onPress?.();
    });
    const onConfirmDelete = jest
      .fn<() => Promise<{ readonly kind: 'guest_wipe_completed' }>>()
      .mockRejectedValue(new Error('Services are still initialising.'));
    const { getByLabelText, getByText } = render(
      <DeleteAccountScreen onConfirmDelete={onConfirmDelete} />,
    );

    fireEvent.press(getByLabelText('I understand this permanently deletes my account and data'));
    fireEvent.press(getByLabelText('Delete my account permanently'));

    await waitFor(() => {
      expect(getByText('Services are still initialising.')).toBeTruthy();
    });
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
