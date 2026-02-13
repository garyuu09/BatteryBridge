# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BatteryBridge is a cross-platform mobile app (iOS, Android, Web) built with Expo SDK 54, React Native 0.81, React 19, and TypeScript 5.9. The project name "BleLevelChecker" indicates planned BLE (Bluetooth Low Energy) battery level checking functionality, but the app is currently in starter-template state with only UI scaffolding.

## Commands

All commands run from the `BatteryBridge/` directory:

```bash
npm install              # Install dependencies
npm start                # Start Expo dev server (press i/a/w for iOS/Android/Web)
npm run ios              # Start and open iOS simulator
npm run android          # Start and open Android emulator
npm run web              # Start and open web browser
npm run lint             # Run ESLint via expo lint
npm run reset-project    # Move starter code to app-example/, create blank app/
```

No test runner is configured yet.

## Architecture

**Routing:** Expo Router with file-based routing. Files in `app/` map to routes. The `(tabs)/` directory is a route group containing bottom tab screens. `_layout.tsx` files define navigators at each level.

**Theme system:** Light/dark mode via `useColorScheme()` hook. Colors defined in `constants/theme.ts`. Components use `useThemeColor()` from `hooks/` to resolve colors. `ThemedView` and `ThemedText` are the base themed primitives.

**Platform-specific files:** Use `.ios.tsx` / `.web.ts` suffixes for platform variants (e.g., `icon-symbol.ios.tsx`, `use-color-scheme.web.ts`). Metro bundler resolves the correct file per platform automatically.

**Path aliases:** `@/*` maps to the project root (configured in `tsconfig.json`). Use `@/components/...`, `@/hooks/...`, `@/constants/...` for imports.

**Animations:** Uses `react-native-reanimated` for GPU-accelerated animations (e.g., `ParallaxScrollView`, `HelloWave`).

**Experimental features enabled** in `app.json`: `typedRoutes` (type-safe route names) and `reactCompiler` (React Compiler). New Architecture is also enabled.
