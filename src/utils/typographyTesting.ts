/**
 * Typography Testing Utilities
 * 
 * Utilities for testing typography on external monitors and various display configurations.
 * Use these functions to verify typography scaling, contrast, and readability.
 */

import { getScreenInfo, getScaleFactor, isExternalMonitor, isHighDPI, DeviceType, getDeviceType } from '../theme/responsiveTypography';
import { verifyTextContrast, getContrastRatio } from '../theme/contrastUtils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

/**
 * Typography test results
 */
export interface TypographyTestResults {
  screenInfo: ReturnType<typeof getScreenInfo>;
  isExternal: boolean;
  isHighDPI: boolean;
  scaleFactor: number;
  deviceType: DeviceType;
  contrastTests: Array<{
    textColor: string;
    backgroundColor: string;
    fontSize: number;
    contrastRatio: number;
    wcag: ReturnType<typeof verifyTextContrast>['wcag'];
  }>;
  recommendations: string[];
}

/**
 * Test typography configuration for current display
 * 
 * Runs comprehensive tests for:
 * - Screen dimensions and DPI
 * - Scaling factors
 * - Contrast ratios
 * - WCAG compliance
 * 
 * @returns Complete test results with recommendations
 */
export const testTypographyConfiguration = (): TypographyTestResults => {
  const screenInfo = getScreenInfo();
  const scaleFactor = getScaleFactor();
  const deviceType = getDeviceType();
  const isExternal = isExternalMonitor();
  const isHighDPIDevice = isHighDPI();

  // Test contrast ratios for common text/background combinations
  const contrastTests = [
    {
      textColor: colors.textPrimary,
      backgroundColor: colors.surfaceLight,
      fontSize: 14, // Body text
      contrastRatio: getContrastRatio(colors.textPrimary, colors.surfaceLight),
      wcag: verifyTextContrast(colors.textPrimary, colors.surfaceLight, 14).wcag,
    },
    {
      textColor: colors.textSecondary,
      backgroundColor: colors.surfaceLight,
      fontSize: 14, // Body text
      contrastRatio: getContrastRatio(colors.textSecondary, colors.surfaceLight),
      wcag: verifyTextContrast(colors.textSecondary, colors.surfaceLight, 14).wcag,
    },
    {
      textColor: colors.textPrimary,
      backgroundColor: colors.surfaceCard,
      fontSize: 18, // H4 heading
      contrastRatio: getContrastRatio(colors.textPrimary, colors.surfaceCard),
      wcag: verifyTextContrast(colors.textPrimary, colors.surfaceCard, 18).wcag,
    },
    {
      textColor: colors.textPrimary,
      backgroundColor: colors.surfaceLight,
      fontSize: 28, // H1 heading
      contrastRatio: getContrastRatio(colors.textPrimary, colors.surfaceLight),
      wcag: verifyTextContrast(colors.textPrimary, colors.surfaceLight, 28).wcag,
    },
  ];

  // Generate recommendations
  const recommendations: string[] = [];

  if (isExternal) {
    if (scaleFactor < 1.1) {
      recommendations.push('Consider increasing font scaling for better external monitor readability');
    }
    if (screenInfo.pixelRatio < 1.5) {
      recommendations.push('Low DPI detected: Ensure fonts are large enough for comfortable reading');
    }
  }

  const failedContrast = contrastTests.filter(test => !test.wcag.pass);
  if (failedContrast.length > 0) {
    recommendations.push(`⚠️ ${failedContrast.length} contrast test(s) failed WCAG AA standards`);
  }

  if (screenInfo.width < 375) {
    recommendations.push('Small screen detected: Verify minimum font sizes (14px body, 11px captions)');
  }

  return {
    screenInfo,
    isExternal,
    isHighDPI: isHighDPIDevice,
    scaleFactor,
    deviceType,
    contrastTests,
    recommendations,
  };
};

/**
 * Get typography scaling information for debugging
 */
export const getTypographyScalingInfo = () => {
  const screenInfo = getScreenInfo();
  const scaleFactor = getScaleFactor();

  return {
    current: {
      deviceType: getDeviceType(),
      pixelRatio: screenInfo.pixelRatio,
      screenWidth: screenInfo.width,
      screenHeight: screenInfo.height,
      scaleFactor,
      isExternal: isExternalMonitor(),
      isHighDPI: isHighDPI(),
    },
    baseSizes: {
      display: typography.display.fontSize,
      h1: typography.h1.fontSize,
      h2: typography.h2.fontSize,
      h3: typography.h3.fontSize,
      h4: typography.h4.fontSize,
      body: typography.body.fontSize,
      bodySmall: typography.bodySmall.fontSize,
      caption: typography.caption.fontSize,
    },
    scaledSizes: {
      display: Math.round(typography.display.fontSize * scaleFactor),
      h1: Math.round(typography.h1.fontSize * scaleFactor),
      h2: Math.round(typography.h2.fontSize * scaleFactor),
      h3: Math.round(typography.h3.fontSize * scaleFactor),
      h4: Math.round(typography.h4.fontSize * scaleFactor),
      body: Math.round(typography.body.fontSize * scaleFactor),
      bodySmall: Math.round(typography.bodySmall.fontSize * scaleFactor),
      caption: Math.round(typography.caption.fontSize * scaleFactor),
    },
  };
};

/**
 * Log typography configuration for debugging
 */
export const logTypographyConfiguration = () => {
  const testResults = testTypographyConfiguration();
  const scalingInfo = getTypographyScalingInfo();

  console.log('=== Typography Configuration ===');
  console.log('Screen Info:', testResults.screenInfo);
  console.log('Device Type:', testResults.deviceType);
  console.log('Scale Factor:', testResults.scaleFactor);
  console.log('Is External Monitor:', testResults.isExternal);
  console.log('Is High DPI:', testResults.isHighDPI);
  console.log('\n=== Base vs Scaled Sizes ===');
  console.log('Base Sizes:', scalingInfo.baseSizes);
  console.log('Scaled Sizes:', scalingInfo.scaledSizes);
  console.log('\n=== Contrast Tests ===');
  testResults.contrastTests.forEach((test, index) => {
    console.log(`Test ${index + 1}:`, {
      textColor: test.textColor,
      backgroundColor: test.backgroundColor,
      fontSize: test.fontSize,
      contrastRatio: test.contrastRatio.toFixed(2),
      wcag: test.wcag.level,
      pass: test.wcag.pass,
    });
  });
  if (testResults.recommendations.length > 0) {
    console.log('\n=== Recommendations ===');
    testResults.recommendations.forEach(rec => console.log(`- ${rec}`));
  }
  console.log('==============================\n');
};
