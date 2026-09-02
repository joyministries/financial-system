import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { notificationsApi, NotificationItem } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';

const CATEGORY_ICONS: Record<string, string> = {
  payment_received: 'card-outline',
  parent_registered: 'person-add-outline',
  student_applied: 'school-outline',
  payment_reversed: 'alert-circle-outline',
  system: 'cog-outline',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list({ limit: 50 }),
        notificationsApi.unreadCount(),
      ]);
      setItems(listRes.data.items || []);
      setUnreadCount(countRes.data.count || 0);
    } catch {
      // Notifications may not be available for parent role
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  const handlePress = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await notificationsApi.markRead(item.id);
        setItems(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch { /* silent */ }
    }
    // TODO: deep-link based on entity_type/entity_id
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const icon = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.system;
    return (
      <TouchableOpacity
        style={[styles.item, !item.is_read && styles.itemUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={colors.icon}
          style={{ marginTop: 2, marginRight: spacing.sm }}
        />
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.itemTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {unreadCount > 0 && (
        <View style={styles.topBar}>
          <Text style={styles.topBarText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySub}>You're all caught up!</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  markAllRead: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', color: colors.accent },
  listContent: { padding: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemUnread: {
    borderColor: colors.accent,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.text },
  itemMessage: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  itemTime: { fontFamily: fonts.body, fontSize: 11, fontWeight: '500', color: colors.textMuted, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
    marginTop: 4,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textMuted },
});
