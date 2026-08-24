/**
 * Push notification service — registers device for Expo Push Notifications,
 * handles incoming notifications, and syncs the push token with the backend.
 *
 * Usage: call `registerForPushNotifications()` once after login.
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import api from '../api/client';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission and get the Expo Push Token.
 * Returns null if permission denied or on error.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied');
      return null;
    }

    // Get the Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C08A34',
      });
    }

    // Sync token with backend (fire-and-forget, non-critical)
    syncPushToken(pushToken).catch(() => {});

    return pushToken;
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return null;
  }
}

/**
 * Send the push token to the backend for storage.
 * The backend uses this to send targeted push notifications.
 */
async function syncPushToken(pushToken: string): Promise<void> {
  try {
    await api.post('/auth/push-token', { push_token: pushToken });
  } catch {
    // Non-critical — will retry on next login
  }
}

/**
 * Remove the push token from the backend (called on logout).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/auth/push-token');
  } catch {
    // Best effort
  }
}

/**
 * Add a listener for incoming notifications while the app is in the foreground.
 * Returns the subscription (call .remove() to unsubscribe).
 */
export function addNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
  onPress: (response: Notifications.NotificationResponse) => void,
) {
  const receiveSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onPress);
  return {
    remove: () => {
      receiveSub.remove();
      responseSub.remove();
    },
  };
}

/**
 * Get the currently stored push token (if any).
 */
export async function getStoredPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync('push_token');
}
