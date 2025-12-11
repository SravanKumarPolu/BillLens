/**
 * Excel Export Helper
 * 
 * Wrapper functions for xlsx library
 */

import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

export interface ExcelWorkbook {
  SheetNames: string[];
  Sheets: { [sheet: string]: XLSX.WorkSheet };
}

/**
 * Generate Excel file from workbook structure
 * Returns file path
 */
export const generateExcelFile = async (
  workbook: ExcelWorkbook,
  fileName?: string
): Promise<string> => {
  try {
    // Convert workbook to binary string
    const wbout = XLSX.write(workbook, { type: 'binary', bookType: 'xlsx' });
    
    // Convert binary string to base64
    const base64 = btoa(
      wtoa(wbout)
    );

    // Generate file path
    const defaultFileName = fileName || `BillLens_Export_${Date.now()}.xlsx`;
    const filePath = Platform.OS === 'ios'
      ? `${RNFS.DocumentDirectoryPath}/${defaultFileName}`
      : `${RNFS.DownloadDirectoryPath}/${defaultFileName}`;

    // Write file
    await RNFS.writeFile(filePath, base64, 'base64');

    return filePath;
  } catch (error) {
    console.error('Error generating Excel file:', error);
    throw error;
  }
};

/**
 * Helper function to convert string to array buffer
 */
function wtoa(s: string): string {
  const w = 32768;
  const chunks: string[] = [];
  for (let i = 0; i < s.length; i += w) {
    chunks.push(s.slice(i, i + w));
  }
  return chunks.join('');
}

/**
 * Share Excel file (requires react-native-share)
 */
export const shareExcel = async (filePath: string): Promise<void> => {
  try {
    // This would require react-native-share to be installed
    // const Share = require('react-native-share').default;
    // await Share.open({
    //   url: `file://${filePath}`,
    //   type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // });
    throw new Error('react-native-share not installed. Install it to enable Excel sharing.');
  } catch (error) {
    console.error('Error sharing Excel file:', error);
    throw error;
  }
};
