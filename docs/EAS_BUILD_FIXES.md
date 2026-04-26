# EAS Build Fixes & Troubleshooting

## Fix 1 — `Cannot find module 'react-native-worklets/plugin'`

**Symptom:** Metro bundling fails immediately on `expo-router/entry.js` with:
```
SyntaxError: Cannot find module 'react-native-worklets/plugin'
Require stack: react-native-reanimated/plugin/index.js
```

**Cause:** `react-native-reanimated` v4+ requires `react-native-worklets` as a separate
peer dependency. It is NOT bundled inside reanimated.

**Fix:**
```bash
# Install the SDK-correct version using the local expo CLI
./node_modules/.bin/expo install react-native-worklets
```

This adds `react-native-worklets` (e.g. `0.5.1` for SDK 54) to `package.json`.

---

## Fix 2 — `[Reanimated] Reanimated requires new architecture to be enabled`

**Symptom:** Gradle build fails during `:react-native-reanimated:assertNewArchitectureEnabledTask`:
```
> [Reanimated] Reanimated requires new architecture to be enabled.
  Please enable it by setting `newArchEnabled` to `true` in `gradle.properties`.
```

**Cause:** `react-native-reanimated` v4 requires the React Native New Architecture.
`app.json` had `"newArchEnabled": false`.

**Fix:** In `app.json`:
```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

---

## Fix 3 — App crashes on launch (splash screen shows then closes)

**Symptom:** APK installs, the splash logo appears, then the app immediately closes.
No JS error visible.

**Cause:** Supabase client initialises with empty strings because `EXPO_PUBLIC_SUPABASE_URL`
and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are in the local `.env` file, which is **not** uploaded
to EAS. The EAS build log will say:
```
No environment variables with visibility "Plain text" and "Sensitive"
found for the "preview" environment on EAS.
```

**Fix:** Upload the env vars to EAS for each affected environment (do this once):
```bash
npx eas env:create \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "<your-supabase-url>" \
  --environment preview \
  --visibility plaintext \
  --non-interactive \
  --scope project \
  --type string

npx eas env:create \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "<your-anon-key>" \
  --environment preview \
  --visibility plaintext \
  --non-interactive \
  --scope project \
  --type string
```

Repeat for `development` and `production` environments as needed.
After uploading, the next build log should say:
```
Environment variables ... loaded from the "preview" environment on EAS:
EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL.
```

---

## Fix 4 — `Cannot find module 'babel-preset-expo'` (do NOT create babel.config.js)

**Symptom:** If a `babel.config.js` is created manually referencing `babel-preset-expo`,
Metro fails with:
```
Cannot find module 'babel-preset-expo'
```

**Cause:** From Expo SDK 50+, `babel-preset-expo` is bundled *inside* the `expo` package
(`expo/node_modules/babel-preset-expo`). It is not a top-level `node_modules` package.
Expo's metro config applies it automatically — no `babel.config.js` is needed.

**Fix:** Delete `babel.config.js`. Expo handles Babel configuration internally, including
auto-injecting the `react-native-reanimated/plugin`.

---

## Summary of changes made for SDK 54 + Reanimated v4 compatibility

| File | Change |
|------|--------|
| `package.json` | Added `"react-native-worklets": "0.5.1"` |
| `app.json` | Changed `"newArchEnabled": false` → `true` |
| EAS project env vars | Added `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for `preview` environment |
| `babel.config.js` | Created then deleted — not needed for Expo SDK 50+ |
