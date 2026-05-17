# Motion & Micro-interactions

**Last updated:** 2026-04-27  
**Scope:** Premium UI/UX feel via Reanimated 4 — entrance, press, count-up, shimmer, tab-bar transitions.

---

## What changed

### New primitives

| Component | What it does | Where to use it |
|---|---|---|
| `PressableScale` | Drop-in `Pressable` with spring scale + optional haptic + optional dim. Spring damping 18, stiffness 350 on press in. | Any custom card/row/tile that needs press feedback. |
| `AnimatedNumber` | Smoothly counts up/down to a numeric value on the **UI thread** via `AnimatedTextInput.text`. | Dashboard stats, KPIs, currency, percentages. |
| `FadeIn` | Subtle fade + translate-Y entrance. Supports `delay`, `duration`, `from='up'/'down'/'none'`, `distance`. | Wrap dashboard sections / cards for staggered reveals. |

### Upgraded primitives

| Component | Upgrade |
|---|---|
| `Skeleton` | Replaced opacity pulse with a translating shimmer band. Pure UI-thread (`withRepeat`). |
| `ListItem` | Press feedback now uses `PressableScale` (`scaleTo: 0.985`). |
| `StatCard` | When `value` is a number, renders via `AnimatedNumber` automatically. Optional `onPress` wraps in `PressableScale`. |
| `QuickActionCard` | `PressableScale` (`scaleTo: 0.97`) replaces manual press transform. |
| `FAB` | Adds a spring entrance (scale + lift + fade) on mount. Press feedback uses `PressableScale`. |
| `AppTabBar` | Pill, focused-icon-chip, and label now animate via Reanimated `LinearTransition` + `FadeIn`/`FadeOut`. Tabs no longer "jump" when switching. |

---

## Usage examples

### PressableScale

```tsx
import { PressableScale } from '@/components/ui';

<PressableScale onPress={onSelect} scaleTo={0.97} dimTo={0.9}>
  <Card>...</Card>
</PressableScale>
```

### AnimatedNumber

```tsx
import { AnimatedNumber } from '@/components/ui';

<AnimatedNumber value={revenue} prefix="$" decimals={2} duration={900} />
<AnimatedNumber value={attendancePct} suffix="%" />
```

> Tip: `StatCard` already does this for you when `value` is a number. Use the bare component only for custom layouts.

### FadeIn

```tsx
import { FadeIn } from '@/components/ui';

<FadeIn delay={40}><HeroCard /></FadeIn>
<FadeIn delay={120}><StatGrid /></FadeIn>
<FadeIn delay={200}><QuickActions /></FadeIn>
```

Recommended cascade: `40 → 120 → 200 → 280` ms for a natural staggered feel.

---

## Where this is wired today

- `app/(app)/(admin)/home.tsx` — hero, stat grid, quick actions all wrapped in `FadeIn` with cascading delays. Stats count up via `StatCard`.
- All screens that use `StatCard`, `QuickActionCard`, `ListItem`, `FAB`, `AppTabBar`, or `Skeleton` automatically inherit the new motion behaviour — **no per-screen migration needed**.

---

## Performance notes

- All motion runs on the UI thread (Reanimated 4 worklets). Zero JS bridge crossings during animation.
- Skeleton shimmer uses a single `withRepeat` shared value per skeleton — cheap.
- `AnimatedNumber` uses `AnimatedTextInput.text` which Reanimated patches via native setNativeProps; no React re-renders during count-up.
- `PressableScale` springs avoid the abrupt feel of `pressed ? 0.97 : 1`.

---

## Accessibility

- `PressableScale` forwards all `Pressable` props including `accessibilityRole`, `accessibilityState`, `accessibilityLabel`. Keep using them.
- Animations respect duration constraints; if the user has Reduce Motion enabled at the OS level, Reanimated honours it automatically for `LinearTransition` and `FadeIn`/`FadeOut` layout animations.
- `AnimatedNumber` is `editable={false}` and `pointerEvents="none"` so screen readers treat it as static text.

---

## Next steps (optional, future)

- **Shared element transitions** between list rows and detail screens (Reanimated `sharedTransitionTag`).
- **Pull-to-refresh custom indicator** with brand spinner.
- **Skeleton-to-content crossfade** on data arrival (300ms `LayoutAnimation` or Reanimated `Layout`).
- **Bottom sheet** spring feel review (currently uses RN `Animated`; could migrate to Reanimated for consistency).
- **Reduce Motion hook** that gates `FadeIn` distance to 0 when user opts out.
