import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Appearance } from 'react-native';
import { lightColors, darkColors, type ColorScheme } from './colors';
import type { Theme } from './index';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colors: ColorScheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialTheme,
}) => {
  const [systemTheme, setSystemTheme] = useState<Theme | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme || 'light');
  
  // Get system theme safely
  useEffect(() => {
    try {
      const colorScheme = Appearance.getColorScheme();
      setSystemTheme(colorScheme || 'light');
      if (!initialTheme) {
        setTheme(colorScheme || 'light');
      }
    } catch (error) {
      console.warn('Error getting color scheme:', error);
      setSystemTheme('light');
    }
  }, [initialTheme]);

  // Sync with system theme changes
  useEffect(() => {
    if (!initialTheme && systemTheme) {
      setTheme(systemTheme);
    }
  }, [systemTheme, initialTheme]);
  
  // Listen to system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (!initialTheme && colorScheme) {
        setTheme(colorScheme);
        setSystemTheme(colorScheme);
      }
    });
    
    return () => subscription.remove();
  }, [initialTheme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const themeColors = theme === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors: themeColors, toggleTheme }}>
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

