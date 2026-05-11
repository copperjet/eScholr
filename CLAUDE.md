# EduCore / eScholr

Multi-tenant school management system. Mobile-first (iOS, Android) + Web via Expo Router.

## Stack
Expo SDK 54 | React Native 0.81.5 | expo-router 6 | Supabase (Postgres+Auth+RLS+Edge Functions) | Zustand (auth) | React Query (server state) | TypeScript | Reanimated 4

## Layout
eScholr/
  app/(auth)/            Auth flow (school-code → login → biometric)
  app/(app)/(platform)/  Platform admin (super_admin)
  app/(app)/(admin)/     School admin/super/principal/coordinator/hod
  app/(app)/(hrt)/       Homeroom teacher
  app/(app)/(st)/        Subject teacher
  app/(app)/(student)/   Student
  app/(app)/(parent)/    Parent
  app/(app)/(finance)/   Finance officer
  app/(app)/(frontdesk)/ Front desk
  app/(app)/(hr)/        HR
  components/ui/         31 design system components
  hooks/                 17 React Query data hooks
  lib/                   Supabase client, theme, roleScope, responsive
  stores/                authStore.ts (Zustand)
  supabase/migrations/   45 SQL migrations
  supabase/functions/    22 Deno edge functions

## Roles (14)
super_admin, school_super_admin, admin, principal, coordinator, hod, hrt, st, finance, front_desk, hr, librarian, parent, student

## Dev Commands
cd "C:\Users\Denny\3D Objects\APPS\EduCore\eScholr"
npx expo start          # Dev server (w=web, i=iOS, a=Android)
npx expo start --web    # Web only
npx supabase db push    # Push migrations
npx supabase functions deploy  # Deploy edge functions

## Conventions
- 3-tap rule: no common task > 3 taps
- Skeleton screens only, never spinners or "Loading..." text
- All colors from useTheme() hook, dark mode from day 1
- RLS enforced: every table has school_id, every query includes .eq('school_id', schoolId)
- Empty states: EmptyState component. Error states: ErrorState component with retry.
- Data hooks: one file per domain in hooks/. React Query with staleTime + queryKey conventions.
- Supabase calls: (supabase as any) pattern. Always include school_id filter.
- Import components from components/ui barrel, never direct file imports.
- Desktop: ResponsiveShell + useShouldShowSidebar(). Mobile: AppTabBar.
- Navigation: router.push() from expo-router. Cast paths with `as any`.
