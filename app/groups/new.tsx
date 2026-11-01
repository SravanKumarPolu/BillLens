/**
 * /groups/new — Create group (modal).
 * Thin route file: delegates to {@link NewGroupScreen}.
 */

import { NewGroupScreen } from '@presentation/screens/group/NewGroupScreen';

export default function NewGroupRoute(): JSX.Element {
  return <NewGroupScreen />;
}
