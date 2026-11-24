# Stride — Real-Phone Android & Web Manual QA Checklist

Run this physical device checklist before public Play Store / production release:

## 1. Android Recording & Background Reliability
- [ ] **Permission Flow**: On fresh install, verify Stride displays the pre-permission explanation sheet, requests `ACCESS_FINE_LOCATION`, then `ACCESS_BACKGROUND_LOCATION`, then `POST_NOTIFICATIONS` (Android 13+).
- [ ] **Permission Denial Recovery**: Deny background location once -> verify app displays clear settings prompt without crashing and still records foreground activities.
- [ ] **Screen-Off / Background Recording**: Start a 20+ minute outdoor walk/run, lock the phone screen, switch to another app (camera/music), and verify persistent foreground notification stays active and final distance matches reference GPS within 1–2%.
- [ ] **Battery Saver / Doze**: Test with battery optimization toggled on a mid-range Android phone (Xiaomi/Samsung/Pixel) and document OEM battery whitelist guidance if needed.
- [ ] **Crash & Force-Kill Recovery**: Start recording, swipe-kill the app from Android recents after 20+ seconds, reopen Stride -> confirm "Unfinished Activity Detected" modal recovers all points cleanly.
- [ ] **Airplane-Mode Offline Recording & Idempotent Sync**: Enable Airplane Mode, record and tap "Stop & Save" -> confirm activity queues in local SQLite (`pendingOfflineCount = 1`). Re-enable data, tap sync (or wait for auto-sync) and tap sync twice -> confirm exact 1 activity exists on server (zero duplicates).
- [ ] **Upgrade-in-Place**: Install APK v1.0.0 with queued offline recording, install v1.0.1 over it -> verify SQLite queue & secure tokens survive intact.

## 2. Privacy & Theme Smoke Checks
- [ ] Create a Home Privacy Zone (250m) -> record an activity starting inside it -> sign in as a second user -> confirm start coordinates are hidden in feed, detail map, and downloaded `.gpx`.
- [ ] Switch between Dark, Light, and Follow System themes on web and phone -> verify zero flash on page reload and full readability of Hindi (`हिन्दी`) Devanagari text.
