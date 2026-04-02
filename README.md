# ⚡ JEE Alarm — No Mercy. No Snooze.

A punishment alarm app for JEE aspirants. You can't dismiss it until you solve N JEE Advanced-quality MCQs.

---

## Features

### 🔔 Core Alarm
- Set alarms with hour:minute picker
- Repeat daily or one-time
- Screen wakes up fully (even from lock screen on Android)
- Cannot swipe back or press back button during alarm

### 🧠 Question Gating
- N questions must be solved correctly to dismiss the alarm (N set per alarm)
- Topics: Physics / Chemistry / Mathematics — choose specific topic
- Difficulty: 1 (JEE Main) to 5 (Olympiad-level)
- Question type: Single Correct, Multi Correct, or Mixed
- Questions generated live by Claude AI (claude-opus-4-5)
- Falls back to hardcoded questions if no internet/API key

### 💀 Wrong Answer Logic
- First wrong attempt: shows correct answer highlight, retry allowed
- Second wrong attempt (MAX = 2): **30-second forced pause** with countdown
- After 30s: alarm resumes with a **new question** (question not carried forward)
- Repeat until N questions answered correctly

### 🔋 Intentional Shutdown Penalty
- App saves battery level every ~15 minutes (background task)
- On next boot: checks last stored battery
- If battery was **≥ 5% → intentional shutdown → PENALTY ACTIVE**
- If battery was **< 5% → assumed phone died → no penalty** (fair!)
- Penalty = **2× the questions** on next alarm

### 🔒 Hard to Uninstall (Android)
- App requests **Device Administrator** privileges on first launch
- To uninstall, user must:
  1. Settings → Security → Device Admin Apps
  2. Deactivate JEE Alarm
  3. THEN uninstall from Apps
- Nobody does 4 deliberate steps at 6am half-asleep.

---

## Setup

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Android device or emulator (iOS supported but Device Admin is Android-only)
- Anthropic API key (get free at https://console.anthropic.com)

### Installation

```bash
# Clone / copy project folder
cd jee-alarm
npm install

# For development (Expo Go — limited, no Device Admin, no background):
npx expo start

# For full features (recommended):
npx expo run:android
```

### API Key Setup
1. Open the app
2. Tap **🔑 API** button (top right)
3. Paste your `sk-ant-...` key
4. Save — questions now generate live via Claude

Without an API key, the app falls back to 3 built-in hardcoded questions (rotated randomly). Still rings, still blocks.

### Alarm Sound
Place an `alarm.mp3` file at `assets/alarm.mp3`.  
Use any loud alarm sound. Royalty-free options: freesound.org

---

## Architecture

```
App.js                          — Entry point, navigation
src/
  context/AlarmContext.js       — Global alarms state, penalty state
  screens/
    HomeScreen.js               — Alarm list, penalty banner, API key
    CreateAlarmScreen.js        — Full alarm config UI
    AlarmRingingScreen.js       — The punishment screen
  services/
    AlarmService.js             — expo-notifications scheduling, boot detection
    QuestionService.js          — Claude API calls, prompt building, fallbacks
    StorageService.js           — AsyncStorage wrappers (alarms, battery, penalty)
    DeviceAdminService.js       — Device Administrator request (Android)
  data/
    theme.js                    — Colors, design tokens
```

---

## Battery Penalty Logic (Detailed)

```
Every 15 min (background task) → save battery level to AsyncStorage

Phone turned off by user
     ↓
Phone boots back up
     ↓
App launches → checkBootPenalty() runs
     ↓
Reads lastBattery from storage
     ↓
lastBattery >= 0.05 (5%)?
  YES → Penalty: { active: true, multiplier: 2 }
   NO → No penalty (phone died naturally)
```

---

## Device Admin (Detailed)

The Device Admin flow works as follows:

1. App calls `requestDeviceAdmin()` on first launch
2. Android shows system dialog: "Allow JEE Alarm to be a Device Administrator?"
3. User taps "Activate"
4. App is now protected

To uninstall without deactivating first:
- Android shows: *"This app is a device administrator. You must deactivate it before uninstalling."*
- This is a system-enforced hard block — no way around it without going through Settings.

**Note:** Requires a custom dev build (`expo run:android`), not Expo Go.

---

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build APK for Android
eas build --platform android --profile preview
```

---

## Customization

| Setting | File | Variable |
|---|---|---|
| Wrong attempts before pause | AlarmRingingScreen.js | `MAX_WRONG` |
| Pause duration | AlarmRingingScreen.js | `PAUSE_DURATION` |
| Battery threshold | AlarmService.js | `>= 0.05` |
| Penalty multiplier | AlarmService.js | `multiplier: 2` |
| Max questions per alarm | CreateAlarmScreen.js | `Math.min(20, ...)` |
| AI model | QuestionService.js | `claude-opus-4-5` |

---

## Tips for Maximum Suffering 🔥

- Set difficulty to **4 or 5** for topics you're weakest in
- Use **Multi Correct** type — much harder to guess
- Set **N = 7-10** questions
- Enable Device Admin immediately
- Set alarm for **5:30 AM**

Good luck. You'll need it.
