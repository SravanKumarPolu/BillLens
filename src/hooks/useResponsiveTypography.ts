/**
 * useResponsiveTypography Hook
 * 
 * Provides responsive typography that adapts to screen size and DPI
 * Ensures readable text on external monitors and all devices
 */

import { useMemo } from 'react';
import { getResponsiveTypography } from '../theme/responsiveTypography';
import type { TypographyKey } from '../theme/typography';

/**
 * Hook to get responsive typography styles
 * Automatically adapts to screen size and DPI
 * 
 * @returns Responsive typography object with all typography tokens
 */
export const useResponsiveTypography = () => {
  return useMemo(() => getResponsiveTypography(), []);
};

/**
 * Hook to get a specific responsive typography style
 * 
 * @param key - Typography token key
 * @returns Responsive typography style for the key
 */
export const useTypography = (key: TypographyKey) => {
  const responsive = useResponsiveTypography();
  return useMemo(() => responsive[key], [key]);
};
