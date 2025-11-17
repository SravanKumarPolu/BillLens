import React, { createContext, useContext, useState, ReactNode } from 'react';
import { colors } from './colors';
import type { Theme } from './index';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colors: typeof colors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialTheme = 'light',
}) => {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // For now, we only have light mode colors
  // In the future, we can add dark mode colors here
  const themeColors = colors;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

