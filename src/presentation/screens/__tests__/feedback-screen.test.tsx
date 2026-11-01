/**
 * FeedbackScreen component tests — the Prompt 82 feedback form's pure view.
 *
 * Renders `FeedbackView` with constructed state (the same shape the
 * container manages) and verifies: the privacy notice, the three type
 * options with selection state, the body counter, the contact opt-in
 * toggle, the submit gating (empty body / services not ready), the error
 * banner, and the submitted confirmation card.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { SubmitFeedbackOutput } from '@application/feedback';
import { FeedbackView } from '@presentation/screens/feedback/FeedbackScreen';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    back: () => undefined,
    replace: () => undefined,
  },
}));

function baseProps(): React.ComponentProps<typeof FeedbackView> {
  return {
    type: 'general',
    onTypeChange: jest.fn(),
    body: '',
    onBodyChange: jest.fn(),
    contactOptIn: false,
    onContactOptInChange: jest.fn(),
    submitting: false,
    submitted: null,
    error: null,
    onSubmit: jest.fn(),
    onReset: jest.fn(),
    servicesReady: true,
  };
}

describe('FeedbackView', () => {
  it('renders the header, privacy notice, type options, and empty counter', () => {
    const { getAllByText, getByText } = render(<FeedbackView {...baseProps()} />);

    // The screen title and the submit button share the label — both render.
    expect(getAllByText('Send feedback')).toHaveLength(2);
    expect(getByText('Private by design')).toBeTruthy();
    expect(getByText('What kind of feedback?')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
    expect(getByText('Feature request')).toBeTruthy();
    expect(getByText('Bug report')).toBeTruthy();
    expect(getByText('0 / 4000')).toBeTruthy();
    expect(getByText('It is okay to contact me about this feedback')).toBeTruthy();
  });

  it('marks the selected type option and reports others as unselected', () => {
    const { getByLabelText } = render(
      <FeedbackView {...baseProps()} type="bug_report" />,
    );

    const general = getByLabelText('General — Anything else you want to tell us');
    const bug = getByLabelText('Bug report — Something broke or behaved oddly');
    expect(general.props.accessibilityState.selected).toBe(false);
    expect(bug.props.accessibilityState.selected).toBe(true);
  });

  it('selecting a type option calls onTypeChange', () => {
    const onTypeChange = jest.fn();
    const { getByLabelText } = render(
      <FeedbackView {...baseProps()} onTypeChange={onTypeChange} />,
    );

    fireEvent.press(getByLabelText('Feature request — Something you wish BillLens could do'));
    expect(onTypeChange).toHaveBeenCalledWith('feature_request');
  });

  it('typing calls onBodyChange and the counter reflects the body length', () => {
    const onBodyChange = jest.fn();
    const { getByLabelText, getByText } = render(
      <FeedbackView {...baseProps()} body="The sync banner flickers." onBodyChange={onBodyChange} />,
    );

    // "The sync banner flickers." is 25 characters.
    expect(getByText('25 / 4000')).toBeTruthy();

    const input = getByLabelText('Feedback text');
    fireEvent.changeText(input, 'More detail');
    expect(onBodyChange).toHaveBeenCalledWith('More detail');
  });

  it('submit is gated while the body is only whitespace', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(
      <FeedbackView {...baseProps()} body="   " onSubmit={onSubmit} />,
    );

    // Whitespace-only body → the send button carries the disabled state.
    const send = getByLabelText('Send feedback — saves a privacy-redacted copy on this device');
    expect(send.props.accessibilityState.disabled).toBe(true);
  });

  it('submit is gated when services are not ready, with an honest note', () => {
    const { getByLabelText, getByText } = render(
      <FeedbackView {...baseProps()} body="Something useful." servicesReady={false} />,
    );

    const send = getByLabelText(
      'Send feedback — waiting for the app to finish starting',
    );
    expect(send.props.accessibilityState.disabled).toBe(true);
    expect(
      getByText(
        'Waiting for app services — feedback can be sent once the app has finished starting.',
      ),
    ).toBeTruthy();
  });

  it('renders the error banner when submission failed', () => {
    const { getByText } = render(
      <FeedbackView {...baseProps()} body="Something useful." error="Database is locked" />,
    );

    expect(getByText('Feedback could not be saved')).toBeTruthy();
    expect(getByText('Database is locked')).toBeTruthy();
  });

  it('renders the submitted confirmation card with the reset action', () => {
    const submitted: SubmitFeedbackOutput = {
      id: 'fb-1',
      type: 'general',
      redactedBodyPreview: 'Great app',
      storedAt: '2026-10-11T10:00:00.000Z',
    };
    const onReset = jest.fn();
    const { getByText, getByLabelText } = render(
      <FeedbackView {...baseProps()} submitted={submitted} onReset={onReset} />,
    );

    expect(getByText('Thank you — feedback saved')).toBeTruthy();
    expect(getByText('Send more feedback')).toBeTruthy();

    fireEvent.press(getByLabelText('Send more feedback — resets the form'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('toggling contact opt-in calls onContactOptInChange', () => {
    const onContactOptInChange = jest.fn();
    const { getByLabelText } = render(
      <FeedbackView {...baseProps()} onContactOptInChange={onContactOptInChange} />,
    );

    const toggle = getByLabelText('Contact me about this feedback');
    expect(toggle.props.accessibilityState.checked).toBe(false);

    fireEvent.press(toggle);
    expect(onContactOptInChange).toHaveBeenCalledWith(true);
  });
});
