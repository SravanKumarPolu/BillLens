/**
 * /groups/join — Join group via invite code (modal).
 * Thin route file: delegates to {@link JoinGroupScreen}.
 */

import { JoinGroupScreen } from '@presentation/screens/group/JoinGroupScreen';

export default function JoinGroupRoute(): JSX.Element {
  return <JoinGroupScreen />;
}
