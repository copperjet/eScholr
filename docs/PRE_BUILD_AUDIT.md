# Scholr — Pre-Build Audit Plan
**Date:** 2026-04-24
**Target build:** EAS `preview` profile → Android APK

---

## 1. Root Cause of Last Build Failure

```
react-native-reanimated@3.17.5 installed
react-native-reanimated ~4.1.1 required by Expo SDK 54
```

`ReanimatedPackage.java` uses `Systrace.TRACE_TAG_REACT_JAVA_BRIDGE` and a `LengthPercentage.resolve()` signature that no longer exist in React Native 0.81 — both were removed between RN 0.76 and 0.78. The v3 Android native code cannot compile against the SDK 54 / RN 0.81.5 headers.

**Fix:** Update `react-native-reanimated` from `~3.17.4` → `~4.1.1` in `package.json`.

---

## 2. Audit Checklist

### 2a. Dependency versions (package.json)
| Package | Installed | Required by SDK 54 | Action |
|---------|-----------|-------------------|--------|
| react-native-reanimated | ~3.17.4 | ~4.1.1 | **UPDATE** |
| @shopify/flash-list | 2.0.2 | 2.0.2 | ✅ |
| react-native-screens | ~4.16.0 | ~4.16.0 | ✅ |
| react-native-gesture-handler | ~2.28.0 | ~2.28.0 | ✅ |
| react-native-safe-area-context | ~5.6.0 | ~5.6.0 | ✅ |
| react-native-webview | 13.15.0 | 13.15.0 | ✅ |
| expo-router | ~6.0.23 | ~6.0.23 | ✅ |

### 2b. app.json / build config
- `newArchEnabled: false` ✅ (required — reanimated 4 + new arch needs extra config)
- `edgeToEdgeEnabled: true` — check: safe area insets all screens handle bottom padding
- `scheme: "scholr"` ✅
- `plugins` includes `expo-router`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `expo-font`, `expo-web-browser` ✅
- Missing plugin: `expo-image-picker` needs no plugin (permissions auto-handled on SDK 54) ✅
- Missing plugin: `expo-document-picker` — no plugin needed for SDK 54 ✅
- Missing plugin: `expo-file-system` — no plugin needed ✅
- Android permissions: only biometric declared; camera permission needed for ImagePicker → **ADD** `CAMERA` permission

### 2c. reanimated 4 API compatibility
reanimated 4 is API-compatible with v3 for the hooks used in attendance.tsx:
- `useSharedValue` ✅
- `useAnimatedStyle` ✅
- `withSpring`, `withTiming`, `withDelay` ✅
- `Animated.View` ✅
No migration changes needed in app code.

### 2d. Import audit — all screens
Check every `app/` file for:
- [ ] Missing named imports
- [ ] References to non-existent style keys
- [ ] `router.push(` targets that have no registered screen
- [ ] `supabase as any` cast coverage
- [ ] `expo-file-system/legacy` used where `cacheDirectory` / `EncodingType` needed ✅

### 2e. Navigation / route registration
Verify every `router.push()` target has a corresponding file:
| Route | File | Registered |
|-------|------|-----------|
| `/(app)/(admin)/announcements` | ✅ | ✅ _layout hidden |
| `/(app)/(admin)/timetable-upload` | ✅ | ✅ _layout hidden |
| `/(app)/announcements` | ✅ | auto Stack |
| `/(app)/timetable` | ✅ | auto Stack |
| `/(app)/search` | ✅ | auto Stack |
| `/(app)/student/[id]` | ✅ | auto Stack |
| `/(app)/(hrt)/creed` | ✅ | ✅ registered S16 |
| `/(app)/(hrt)/daybook` | ✅ | ✅ registered S16 |
| `/(app)/(hrt)/reports` | ✅ | ✅ registered S16 |

### 2f. SafeAreaView / EdgeToEdge
`edgeToEdgeEnabled: true` in app.json means Android will draw behind the status bar and nav bar. Every screen uses `<SafeAreaView>` from `react-native` ✅ (not expo's). Safe.

### 2g. TypeScript
Run `npx tsc --noEmit` → must pass 0 errors before build.

### 2h. Metro bundle dry-run
Run `npx expo export --platform android --dev false` to detect any runtime import errors that tsc misses (dynamic requires, missing assets, etc.)

---

## 3. Fixes to Implement (in order)

1. **[CRITICAL]** Update `react-native-reanimated` → `~4.1.1` in package.json
2. **[IMPORTANT]** Add `CAMERA` permission to `app.json` android permissions array (required by `expo-image-picker` on Android 13+)
3. **[IMPORTANT]** Add `expo-image-picker` plugin entry to `app.json` with `photosPermission` and `cameraPermission` strings
4. **[IMPORTANT]** Add `expo-document-picker` plugin entry to `app.json`  
5. Verify all `Colors.semantic` references compile (no missing keys)
6. Verify `lib/haptics.ts` exports `.success()`, `.error()`, `.medium()`, `.selection()` 
7. Verify `components/ui/index.ts` exports all used components
8. Verify `BottomSheet` `snapHeight` prop exists in component definition
9. Run `npx tsc --noEmit` → 0 errors
10. Confirm `package-lock.json` will be regenerated on EAS build (it uses npm install)

---

## 4. Known Non-Issues (intentional)
- All the `w:` deprecation warnings from `react-native-screens`, `react-native-webview`, `react-native-safe-area-context` are **warnings only**, not errors — they do not break the build.
- `NODE_ENV` warning from `expo-constants` is cosmetic.
- `package attribute` warning from safe-area-context is cosmetic.
