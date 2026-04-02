/**
 * DeviceAdminService.js
 *
 * Requests Device Administrator privileges on Android.
 * Once granted, the user CANNOT uninstall JEE Alarm without first going to:
 *   Settings → Security → Device Admin Apps → JEE Alarm → Deactivate
 * That's 4 deliberate taps — impossible to do half-asleep at 6am. 😈
 *
 * REQUIREMENTS:
 *   - Custom dev build: `expo run:android`  (NOT Expo Go)
 *   - android/app/src/main/AndroidManifest.xml needs the receiver (see README)
 */

import { Platform, Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ADMIN_REQUESTED_KEY = '@device_admin_requested';
const PACKAGE = 'com.sayantan.jeealarm';
const RECEIVER = `${PACKAGE}/com.sayantan.jeealarm.AdminReceiver`;

export async function requestDeviceAdmin() {
  if (Platform.OS !== 'android') return;

  // Only ask once — don't nag on every launch
  const already = await AsyncStorage.getItem(ADMIN_REQUESTED_KEY);
  if (already) return;
  await AsyncStorage.setItem(ADMIN_REQUESTED_KEY, '1');

  // Proper Android intent URI for Device Admin activation
  const intentUri =
    `intent:#Intent;` +
    `action=android.app.action.ADD_DEVICE_ADMIN;` +
    `component=${encodeURIComponent(RECEIVER)};` +
    `S.android.app.extra.ADD_EXPLANATION=${encodeURIComponent("JEE Alarm needs Device Admin to prevent easy uninstall. You agreed to suffer.");};` +
    `end`;

  const canOpen = await Linking.canOpenURL(intentUri).catch(() => false);

  if (canOpen) {
    await Linking.openURL(intentUri);
  } else {
    // Fallback: manual instructions
    Alert.alert(
      '🔒 Enable Device Admin',
      'To prevent easy uninstall during weak moments:\n\n' +
      '1. Open Settings\n' +
      '2. Search "Device Admin" (or Security → Device Admin Apps)\n' +
      '3. Tap JEE Alarm → Activate\n\n' +
      'After this you\'ll need 4 deliberate steps to uninstall.',
      [{ text: 'Got it', style: 'default' }]
    );
  }
}
