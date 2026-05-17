# eScholr App Assets — Manual Checklist

Config has been fixed in `app.json`. The remaining work requires regenerating the PNG files themselves (I cannot edit binary images). Use **Figma**, **Photoshop**, or a free tool like https://icon.kitchen or https://www.appicon.co.

## ✅ Already Fixed in Config

- Android adaptive icon background: `#1B2A4A` → `#FFFFFF` (no more dark blue square)
- Notification accent color: `#1B2A4A` → `#10B981` (brand green)
- Notification icon path: now points to dedicated monochrome asset

---

## 📋 Required PNG Files

| File | Size | Background | Notes |
|------|------|------------|-------|
| `icon.png` | **1024×1024** | Solid white or transparent | iOS app icon. **No transparency on iOS** — fill with white. Logo centered with ~10% padding. |
| `adaptive-icon.png` | **1024×1024** | **Transparent** | Android foreground. Logo must fit inside the **center 66% safe zone** (leave ~17% padding on each edge — Android masks the outer area). |
| `adaptive-icon-monochrome.png` | **1024×1024** | **Transparent** | Android 13+ themed icons. Pure white silhouette of logo on transparent background. |
| `notification-icon.png` | **96×96** | **Transparent** | **PURE WHITE silhouette only.** Android strips all color and shows colored versions as solid white squares. |
| `favicon.png` | **48×48** or **64×64** | Transparent or white | Web favicon. Currently 3 MB — needs major shrink. |
| `splash-icon.png` | **1284×2778** or 1024×1024 centered | Transparent | Used on splash with white bg (config). Current `scholr-main-logo.png` works but oversized. |

---

## 🎨 Visual Spec

### Adaptive Icon Safe Zone (Android)

```
┌─────────────────────────┐  1024×1024 canvas
│                         │
│   ┌─────────────────┐   │
│   │                 │   │
│   │   LOGO HERE     │   │  Inner 66% = 676×676
│   │   (centered)    │   │  This is the safe zone
│   │                 │   │
│   └─────────────────┘   │
│                         │
└─────────────────────────┘
```
Anything outside the inner 66% gets cropped on round/squircle launchers.

### Notification Icon Rules

- ❌ **Don't:** Use the colored eScholr "S" logo
- ✅ **Do:** Take only the silhouette, fill it pure white (`#FFFFFF`), keep background transparent
- Result: Android tints it with your accent color (`#10B981`) on the lock screen

---

## 🚀 Quickest Path

1. Open https://icon.kitchen
2. Upload your green "S" logo (`scholr-logo.png`)
3. Configure:
   - **iOS Icon:** white background, 10% padding
   - **Android Adaptive:** transparent foreground, white background, **shrink logo to ~70% size**
   - **Android Notification:** white silhouette
4. Download the ZIP — it gives you all sizes
5. Drop the renamed files into this `assets/` folder, replacing the old ones

---

## 🗜️ File Size Targets

| File | Current | Target |
|------|---------|--------|
| icon.png | 3.0 MB | < 200 KB |
| adaptive-icon.png | 3.0 MB | < 200 KB |
| favicon.png | 3.0 MB | < 20 KB |
| scholr-logo.png | 1.0 MB | < 150 KB |
| scholr-main-logo.png | 330 KB | < 150 KB |

Use https://tinypng.com to compress losslessly after export.

---

## 🧪 After Replacing Assets

```powershell
# Rebuild the app to apply icon changes
cd eScholr
npx expo prebuild --clean
npx expo run:android   # or run:ios
```

Icons are baked at build time — hot reload won't show them. You must reinstall the app on the device.
