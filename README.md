# BillLens

**Your Smart Financial Partner**

Whether it's a quick dinner split or managing a shared home, BillLens makes money management effortless, fair, and automatic.

## 🎯 Overview

BillLens makes splitting daily bills effortless. Take a screenshot of any bill or UPI screen, and the app automatically extracts the amount, merchant, and suggests a fair split. Built for flatmates, couples, and anyone sharing expenses.

## ✨ Key Features

- **Screenshot-first**: Point at any bill or UPI screen
- **Always free**: OCR and splits are free, no paywalls
- **Offline-first**: Works without internet, syncs when available
- **Smart extraction**: Auto-detects amount, merchant, date
- **UPI integration**: Quick settle-up with GPay/PhonePe/Paytm
- **Group management**: Multiple groups (home, trips, etc.)

## 🏗️ Project Structure

```
BillLens/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Button.tsx      # Primary, secondary, positive, outline, ghost variants
│   │   ├── Card.tsx        # Card container with optional press
│   │   ├── Chip.tsx        # Filter chips, tags
│   │   ├── Input.tsx       # Text input with label/error
│   │   ├── MoneyDisplay.tsx # Formatted money display
│   │   ├── BalanceBreakdown.tsx # Balance visualization
│   │   ├── FairnessMeter.tsx # Fairness & reliability scores
│   │   ├── InsightsCard.tsx # Insights display
│   │   ├── LensView.tsx    # Balance history view
│   │   ├── Logo.tsx        # Brand logo component
│   │   ├── Modal.tsx       # Modal dialog
│   │   ├── SplitRatioInput.tsx # Split ratio input
│   │   ├── Tabs.tsx        # Tab navigation
│   │   ├── ErrorBoundary.tsx # Error boundary
│   │   └── index.ts        # Component barrel exports
│   ├── screens/            # App screens (18 screens)
│   │   ├── OnboardingWelcome.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── CreateGroupScreen.tsx
│   │   ├── GroupDetailScreen.tsx
│   │   ├── SettleUpScreen.tsx
│   │   ├── AddExpenseScreen.tsx
│   │   ├── AnalyticsScreen.tsx
│   │   ├── LedgerScreen.tsx
│   │   ├── LensViewScreen.tsx
│   │   └── ... (9 more screens)
│   ├── theme/              # Design system
│   │   ├── colors.ts       # Brand color palette
│   │   ├── typography.ts   # Font sizes, weights, line heights
│   │   ├── responsiveTypography.ts # DPI-aware typography
│   │   ├── spacing.ts      # Spacing system
│   │   ├── elevation.ts    # Elevation/shadow system
│   │   ├── transitions.ts # Animation transitions
│   │   ├── glassmorphism.ts # Glassmorphism tokens
│   │   ├── contrastUtils.ts # Accessibility contrast
│   │   ├── ThemeProvider.tsx # Theme context (ready for dark mode)
│   │   └── index.ts        # Theme barrel exports
│   ├── utils/              # Utility functions
│   │   ├── formatMoney.ts  # Money formatting (₹)
│   │   ├── ocrService.ts   # OCR processing
│   │   ├── upiService.ts   # UPI payment integration
│   │   ├── insightsService.ts # AI insights
│   │   ├── fairnessScore.ts # Fairness calculations
│   │   ├── mathUtils.ts    # Financial math utilities
│   │   ├── exportService.ts # Data export (JSON/CSV/Text)
│   │   ├── balanceCache.ts # Balance caching
│   │   ├── migrationService.ts # Data migrations
│   │   ├── settlementExplanation.ts # Settlement explanations
│   │   ├── storageService.ts # Data persistence
│   │   └── index.ts        # Utils barrel exports
│   ├── context/            # React contexts
│   │   ├── AuthContext.tsx # Authentication state
│   │   └── GroupsContext.tsx # Groups & expenses state
│   ├── hooks/              # Custom React hooks
│   │   └── useResponsiveTypography.ts # Responsive typography hook
│   ├── types/              # TypeScript types
│   │   └── models.ts       # Data models
│   ├── navigation/         # Navigation types
│   │   └── types.ts        # Navigation type definitions
│   └── AppNavigator.tsx    # Main navigation setup
├── index.tsx               # App entry point
└── package.json
```

## 🎨 Design System

### Colors

- **Primary**: Indigo (`#2563EB`) — Main CTAs, highlights
- **Accent**: Emerald (`#22C55E`) — Success, settle-up actions
- **Accent Amber**: (`#F59E0B`) — Warnings, analytics
- **Accent Pink**: (`#EC4899`) — Premium/supporter badge

See `DESIGN_SYSTEM.md` for complete usage guidelines.

### Typography

Based on Inter/SF Pro principles:
- **Headings**: H1 (28px), H2 (24px), H3 (20px), H4 (18px)
- **Body**: Large (16px), Regular (14px), Small (13px)
- **Labels/Captions**: 14px, 12px, 11px

See `src/theme/typography.ts` for all styles.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- React Native 0.75+
- iOS Simulator or Android Emulator

### Installation

```bash
# Install dependencies
npm install

# iOS
npm run ios

# Android
npm run android
```

## 📦 Components

### Button

```tsx
import { Button } from '../components';

<Button
  title="Create group"
  onPress={handleCreate}
  variant="primary" // primary | secondary | positive | outline | ghost
  loading={false}
  disabled={false}
/>
```

### Card

```tsx
import { Card } from '../components';

<Card onPress={handlePress} elevated>
  <Text>Card content</Text>
</Card>
```

### Input

```tsx
import { Input } from '../components';

<Input
  label="Group name"
  placeholder="Enter name"
  value={name}
  onChangeText={setName}
  error={error}
/>
```

### MoneyDisplay

```tsx
import { MoneyDisplay } from '../components';

<MoneyDisplay
  amount={450}
  size="medium" // small | medium | large
  showPositive={true}
/>
```

### Chip

```tsx
import { Chip } from '../components';

<Chip
  label="Food"
  variant="primary"
  selected={selected}
  onPress={handlePress}
/>
```

## 🛠️ Utilities

### formatMoney

```tsx
import { formatMoney, parseMoney } from '../utils';

formatMoney(450); // "₹450"
formatMoney(-200, true); // "-₹200"
parseMoney("₹1,500"); // 1500
```

## 🎯 Roadmap

### Phase 1 (Weeks 1-3) ✅
- [x] UI/UX foundation
- [x] Design system (colors, typography)
- [x] Reusable components
- [x] Basic navigation

### Phase 2 (Weeks 4-6)
- [ ] OCR integration (Google Vision API)
- [ ] Screenshot → Extract amount
- [ ] Split engine

### Phase 3 (Weeks 7-9)
- [ ] UPI settle-up
- [ ] Offline support (SQLite)
- [ ] Templates
- [ ] Home group defaults

### Phase 4 (Weeks 10-12)
- [ ] UI polish
- [ ] Light analytics
- [ ] Beta release

### Phase 5 (Weeks 13-14)
- [ ] Dark mode
- [ ] Play Store listing
- [ ] Launch prep

## 📚 Documentation

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** - Complete implementation status, audit reports, improvements summary, and technical details
- **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)** - Brand identity, design tokens, typography system, and component library
- **[WEB_SUPPORT_ANALYSIS.md](./WEB_SUPPORT_ANALYSIS.md)** - Analysis of web support feasibility

## 📝 License

Private project — All rights reserved

---

Built with ❤️ for people who split bills

