import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BATTERY_TASK = 'BATTERY_TRACK_TASK';
const BATTERY_KEY = '@last_battery_pct';
const PENALTY_KEY = '@jee_penalty_v2';
const BOOT_FLAG_KEY = '@booted_since_alarm';

// ─── Notification handler ─────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// ─── Background battery tracking task ────────────────────────────────────────
// Runs every 15 min in background. Stores last known battery %.
// On next boot, we compare: if >= 5% → intentional shutdown → PENALTY.
TaskManager.defineTask(BATTERY_TASK, async () => {
  try {
    const level = await Battery.getBatteryLevelAsync(); // 0.0–1.0
    const pct = Math.round(level * 100);
    await AsyncStorage.setItem(BATTERY_KEY, String(pct));
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBatteryTracking = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BATTERY_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BATTERY_TASK, {
        minimumInterval: 60 * 15, // every 15 minutes
        stopOnTerminate: false,   // survive app kill
        startOnBoot: true,        // auto-start on reboot
      });
    }
  } catch (e) {
    console.warn('Battery tracking registration failed:', e);
  }
};

// ─── Boot penalty check ───────────────────────────────────────────────────────
// Called on every app launch.
// Logic: if last recorded battery >= 5%, the user shut down intentionally.
export const checkBootPenalty = async () => {
  try {
    const bootFlag = await AsyncStorage.getItem(BOOT_FLAG_KEY);
    if (bootFlag === 'checked') return null; // already handled this session

    await AsyncStorage.setItem(BOOT_FLAG_KEY, 'checked');

    const lastBatteryRaw = await AsyncStorage.getItem(BATTERY_KEY);
    if (lastBatteryRaw === null) return null; // first ever install, no history

    const lastBattery = parseFloat(lastBatteryRaw);

    // THE RULE: battery >= 5% at shutdown = intentional = PENALTY
    if (lastBattery >= 5) {
      const penalty = {
        reason: `Phone was turned off with ${lastBattery}% battery — intentional shutdown detected.`,
        extraQuestions: 3, // 3 bonus penalty questions on top of N
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(PENALTY_KEY, JSON.stringify(penalty));
      return penalty;
    }

    return null; // <= 4% → genuine dead battery, no penalty
  } catch (e) {
    return null;
  }
};

// Call when app goes background/inactive to allow next boot to trigger check
export const armBootCheck = async () => {
  await AsyncStorage.removeItem(BOOT_FLAG_KEY);
};

// ─── Alarm scheduling ─────────────────────────────────────────────────────────
export const requestPermissions = async () => {
  const { status } = await Notifications.requestPermissionsAsync({
    android: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowAnnouncements: true,
    },
  });
  return status === 'granted';
};

export const setupNotificationChannel = async () => {
  await Notifications.setNotificationChannelAsync('alarm-channel', {
    name: 'JEE Alarm',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#FF3D3D',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    sound: 'alarm.mp3',
  });
};

export const scheduleAlarm = async (alarm) => {
  await cancelAlarm(alarm.id);

  const now = new Date();
  const trigger = new Date();
  trigger.setHours(alarm.hour, alarm.minute, 0, 0);
  if (trigger <= now) trigger.setDate(trigger.getDate() + 1);

  const notifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚡ JEE ALARM — WAKE UP',
      body: 'Solve to silence. No shortcuts.',
      data: { alarmId: alarm.id },
      sound: 'alarm.mp3',
      sticky: true,
      autoDismiss: false,
      priority: 'max',
    },
    trigger: {
      date: trigger,
      channelId: 'alarm-channel',
    },
  });

  return notifId;
};

export const cancelAlarm = async (alarmId) => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content?.data?.alarmId === alarmId) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (e) {}
};

export const scheduleAllAlarms = async (alarms = []) => {
  await setupNotificationChannel();
  for (const alarm of alarms) {
    if (alarm.enabled) await scheduleAlarm(alarm);
  }
};
