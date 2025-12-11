/**
 * Receipt Service for managing receipts
 * Handles local storage, cloud upload, and download functionality
 */

import { Platform, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { Receipt } from '../types/models';

/**
 * Generate a unique ID for receipts
 */
export const generateReceiptId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Create a receipt object from a URI
 */
export const createReceipt = (uri: string, mimeType?: string): Receipt => {
  return {
    id: generateReceiptId(),
    uri,
    mimeType: mimeType || 'image/jpeg',
    isCloudStored: false,
  };
};

/**
 * Download receipt to device
 */
export const downloadReceipt = async (receipt: Receipt): Promise<string | null> => {
  try {
    const fileName = `receipt-${receipt.id}.${receipt.mimeType?.split('/')[1] || 'jpg'}`;
    const downloadPath = `${RNFS.DownloadDirectoryPath}/${fileName}`;
    
    // Copy file to downloads
    if (receipt.cloudUrl) {
      // Download from cloud
      const downloadResult = await RNFS.downloadFile({
        fromUrl: receipt.cloudUrl,
        toFile: downloadPath,
      }).promise;
      
      if (downloadResult.statusCode === 200) {
        Alert.alert('Success', `Receipt saved to Downloads/${fileName}`);
        return downloadPath;
      }
    } else if (receipt.uri) {
      // Copy local file
      await RNFS.copyFile(receipt.uri, downloadPath);
      Alert.alert('Success', `Receipt saved to Downloads/${fileName}`);
      return downloadPath;
    }
    
    return null;
  } catch (error) {
    console.error('Error downloading receipt:', error);
    Alert.alert('Error', 'Failed to download receipt');
    return null;
  }
};

/**
 * Upload receipt to cloud storage (for Pro users)
 * @deprecated Use cloudStorageService.uploadReceiptToCloud instead
 */
export const uploadReceiptToCloud = async (
  receipt: Receipt,
  userId: string,
  isProUser: boolean
): Promise<Receipt | null> => {
  // Import and use cloud storage service
  const { uploadReceiptToCloud: uploadToCloud } = await import('./cloudStorageService');
  
  try {
    return await uploadToCloud(receipt, {
      userId,
      isProUser,
    });
  } catch (error) {
    console.error('Error uploading receipt to cloud:', error);
    return null;
  }
};

/**
 * Get file size in bytes
 */
export const getFileSize = async (uri: string): Promise<number | null> => {
  try {
    const stat = await RNFS.stat(uri);
    return stat.size || null;
  } catch (error) {
    console.error('Error getting file size:', error);
    return null;
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
