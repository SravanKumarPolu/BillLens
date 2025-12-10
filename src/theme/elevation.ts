/**
 * BillLens Elevation System
 * 
 * Provides consistent depth and elevation for UI components
 * Follows Material Design elevation principles
 * 
 * Usage:
 * import { elevation } from '../theme/elevation';
 * 
 * ...elevation[2]  // Apply elevation level 2
 */

import { ViewStyle } from 'react-native';

export interface ElevationStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/**
 * Elevation levels (Material Design inspired)
 * Higher numbers = more elevation
 */
export const elevation = {
  0: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  4: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  5: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  6: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  8: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

/**
 * Semantic elevation levels for common components
 */
export const semanticElevation = {
  // Cards
  card: elevation[2],           // Standard card
  cardHover: elevation[4],       // Card on hover/press
  cardSelected: elevation[3],   // Selected card
  
  // Buttons
  button: elevation[1],         // Standard button
  buttonPressed: elevation[0],  // Button when pressed
  buttonFloating: elevation[5], // Floating action button
  
  // Modals
  modal: elevation[8],          // Modal/dialog
  modalBackdrop: elevation[0],  // Modal backdrop (no elevation)
  
  // Navigation
  navBar: elevation[4],         // Navigation bar
  navItem: elevation[0],         // Navigation item (no elevation)
  
  // Inputs
  input: elevation[0],           // Input field (no elevation)
  inputFocused: elevation[1],    // Input when focused
  
  // Tooltips
  tooltip: elevation[6],        // Tooltip/popover
  
  // Dropdowns
  dropdown: elevation[5],       // Dropdown menu
} as const;

/**
 * Create elevation style with custom shadow color
 */
export const createElevation = (
  level: keyof typeof elevation,
  shadowColor: string = '#000'
): ElevationStyle => {
  const base = elevation[level];
  return {
    ...base,
    shadowColor,
  };
};

export type ElevationLevel = keyof typeof elevation;
