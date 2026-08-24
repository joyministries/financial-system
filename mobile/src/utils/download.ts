import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'https://backend-financial.vercel.app/api/v1').replace(/\/+$/, '');

/**
 * Downloads a file from the API and shares/saves it via the OS share sheet.
 */
export async function downloadFile(url: string, fallbackFilename: string): Promise<void> {
  try {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const token = await SecureStore.getItemAsync('token');

    const fileUri = FileSystem.cacheDirectory + fallbackFilename;

    const downloadResult = await FileSystem.downloadAsync(fullUrl, fileUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!downloadResult) {
      Alert.alert('Download Failed', 'Could not download the file.');
      return;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Save ${fallbackFilename}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('Downloaded', `File saved to: ${downloadResult.uri}`);
    }
  } catch (err: any) {
    Alert.alert('Download Error', err?.message || 'Failed to download file.');
  }
}
