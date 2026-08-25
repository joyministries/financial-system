import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { notificationsApi } from '../api/client';

const POLL_INTERVAL = 30000; // 30 seconds

/**
 * Hook that polls unread notification count and sets the bell badge
 * via navigation.setOptions(). Safe for tab screens — only polls when
 * the screen is focused.
 */
export default function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigation = useNavigation<any>();
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await notificationsApi.unreadCount();
      const count = res.data?.count ?? 0;
      setUnreadCount(count);
      navigation.setOptions({ headerUnreadCount: count });
    } catch {
      // silent — token may be expired, etc.
    }
  }, [navigation]);

  // Poll while screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchCount();
      intervalRef.current = setInterval(fetchCount, POLL_INTERVAL);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [fetchCount])
  );

  // Re-poll when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        fetchCount();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [fetchCount]);

  return unreadCount;
}
