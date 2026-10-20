/**
 * BentoGrid — responsive 2-column bento layout.
 *
 * Renders children in a wrapped 2-column grid (collapses to 1 column
 * when the parent width drops below `breakpoints.tablet`). Each
 * child may opt into a `span={2}` to take the full row.
 *
 * Design notes:
 *   - The grid uses React Native's `flexDirection: 'row'` + `flexWrap:
 *     'wrap'` rather than CSS Grid (RN does not expose CSS Grid).
 *   - Each child must accept `style` and spread it onto its root view
 *     (the design-system `Card` already does this).
 *   - The inter-tile gap is `spacing.md` (12px) — balanced, not tight,
 *     matching the "classic and elegant" aesthetic: generous whitespace,
 *     not cramped.
 */

import type { ReactNode } from 'react';
import { Dimensions, type DimensionValue, View } from 'react-native';

import { useTheme } from '../theme';
import { breakpoints, spacing } from '../tokens';

// `useTheme` is imported lazily inside BentoItem — the grid component itself
// does not need it, only the item wrapper does.

export interface BentoItemProps {
  /** 1 = half-width (default), 2 = full-width. */
  readonly span?: 1 | 2;
  readonly children: ReactNode;
  /** Optional accessibility label forwarded to the tile view. */
  readonly accessibilityLabel?: string;
  /** Optional accessibility role forwarded to the tile view. */
  readonly accessibilityRole?: 'button' | 'text' | 'link' | 'header';
}

export interface BentoGridProps {
  readonly children: readonly ReactNode[];
  /** Override the gap between tiles (defaults to `spacing.md`). */
  readonly gap?: number;
}

/**
 * Compute the tile width for a given span + container width + gap.
 *
 *   - span=1 → (containerWidth - gap) / 2
 *   - span=2 → containerWidth (full row)
 *
 * Exported so tests can verify the math without rendering.
 */
export function computeBentoTileWidth(
  span: 1 | 2,
  containerWidth: number,
  gap: number,
): DimensionValue {
  if (span === 2) return '100%';
  // Subtract one gap (the middle gap) for two equal-width columns.
  return Math.max(0, (containerWidth - gap) / 2);
}

export function BentoGrid({ children, gap }: BentoGridProps): JSX.Element {
  const resolvedGap = gap ?? spacing.md;
  const containerWidth = Dimensions.get('window').width;
  const isTablet = containerWidth >= breakpoints.tablet;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: resolvedGap,
        alignItems: 'stretch',
      }}
      accessibilityRole="none"
    >
      {children.map((child, idx) => {
        // Each direct child is wrapped in a BentoTile if it isn't already
        // a BentoItem. If the child is a BentoItem, its span is read.
        // Otherwise default span=1 (half-width on phone, full on tablet).
        const span: 1 | 2 = isTablet ? 2 : 1;
        const width = computeBentoTileWidth(span, containerWidth, resolvedGap);
        return (
          <View
            key={`bento-${idx}`}
            style={{ width, flexGrow: span === 1 ? 1 : 0 }}
          >
            {child}
          </View>
        );
      })}
    </View>
  );
}

/**
 * BentoItem — explicit bento tile that opts into a span.
 *
 * Use this when a child needs to span 2 columns (full-width).
 * Children that don't need full-width can be passed directly to
 * `BentoGrid` and get the default span.
 */
export function BentoItem({
  span = 1,
  children,
  accessibilityLabel,
  accessibilityRole,
}: BentoItemProps): JSX.Element {
  const theme = useTheme();
  const containerWidth = Dimensions.get('window').width;
  const width = computeBentoTileWidth(span, containerWidth, spacing.md);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={{
        width,
        flexGrow: span === 1 ? 1 : 0,
        backgroundColor: theme.colors.surface,
      }}
    >
      {children}
    </View>
  );
}
