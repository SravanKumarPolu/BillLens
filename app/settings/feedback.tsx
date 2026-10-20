/**
 * /settings/feedback — the user-facing feedback submission form
 * (Prompt 82 presentation layer).
 *
 * User-facing: reached from Settings → "Send feedback".
 * Deep link: billlens://settings/feedback
 */

import { FeedbackScreen } from '@presentation/screens/feedback/FeedbackScreen';

export default function FeedbackRoute(): JSX.Element {
  return <FeedbackScreen />;
}
