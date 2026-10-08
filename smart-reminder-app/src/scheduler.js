import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const T = Notifications.SchedulableTriggerInputTypes;
const SLOTS = 60; // how many interval notifications to queue ahead

export function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminder', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('alarm', {
      name: 'Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 600, 300, 600, 300, 600],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('interval', {
      name: 'Interval notes',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

function parse(t) {
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

function onceDate(dateStr, t) {
  const { h, m } = parse(t);
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  d.setHours(h, m, 0, 0);
  if (!dateStr && d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

// Interval slot k fires at startAt + k * interval, showing included notes serially.
export function upcoming(state, now = Date.now()) {
  const list = state.notes.filter((n) => n.on);
  if (!state.running || !list.length) return null;
  const step = state.mins * 60000;
  const k = Math.max(0, Math.ceil((now - state.startAt) / step));
  return { note: list[k % list.length], at: state.startAt + k * step };
}

export async function rescheduleAll(state) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const n of state.notes) {
    const channelId = n.alarm ? 'alarm' : 'reminder';
    for (const t of n.times) {
      const { h, m } = parse(t);
      const content = { title: n.title, sound: true, data: { id: n.id } };
      let triggers = [];
      if (n.rep === 'daily') {
        triggers = [{ type: T.DAILY, hour: h, minute: m, channelId }];
      } else if (n.rep === 'days') {
        triggers = n.days.map((d) => ({ type: T.WEEKLY, weekday: d + 1, hour: h, minute: m, channelId }));
      } else {
        const date = onceDate(n.date, t);
        if (date > new Date()) triggers = [{ type: T.DATE, date, channelId }];
      }
      for (const trigger of triggers) {
        await Notifications.scheduleNotificationAsync({ content, trigger });
      }
    }
  }

  const list = state.notes.filter((n) => n.on);
  if (state.running && list.length) {
    const step = state.mins * 60000;
    const first = Math.max(0, Math.ceil((Date.now() - state.startAt) / step));
    for (let i = 0; i < SLOTS; i++) {
      const k = first + i;
      const date = new Date(state.startAt + k * step);
      if (date <= new Date()) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: list[k % list.length].title, sound: true },
        trigger: { type: T.DATE, date, channelId: 'interval' },
      });
    }
  }
}
