/**
 * PDF Export Helper
 * 
 * Wrapper functions for react-native-html-to-pdf
 */

import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { Platform } from 'react-native';

export interface PDFOptions {
  html: string;
  fileName?: string;
  directory?: string;
  base64?: boolean;
}

/**
 * Generate PDF from HTML string
 * Returns file path or base64 string depending on options
 */
export const generatePDF = async (options: PDFOptions): Promise<string> => {
  try {
    const defaultOptions = {
      html: options.html,
      fileName: options.fileName || `BillLens_Export_${Date.now()}`,
      directory: options.directory || Platform.OS === 'ios' ? 'Documents' : 'Download',
      base64: options.base64 || false,
    };

    const file = await RNHTMLtoPDF.convert(defaultOptions);
    return file.filePath || file.base64 || '';
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Share PDF file (requires react-native-share)
 */
export const sharePDF = async (filePath: string): Promise<void> => {
  try {
    // This would require react-native-share to be installed
    // const Share = require('react-native-share').default;
    // await Share.open({
    //   url: `file://${filePath}`,
    //   type: 'application/pdf',
    // });
    throw new Error('react-native-share not installed. Install it to enable PDF sharing.');
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
};
