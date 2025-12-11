# Development Guide

## Setup

### Prerequisites
- Node.js 18+
- pnpm 10+
- Android Studio (for Android development)
- Java JDK 17+

### Installation
```bash
pnpm install
```

### Running
```bash
# Start Metro bundler
pnpm start

# Run Android
pnpm run android
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # App screens
├── context/        # React contexts (Auth, Groups)
├── navigation/     # Navigation configuration
├── theme/          # Design system (colors, typography, spacing)
├── types/          # TypeScript type definitions
└── utils/          # Utility services
```

## Key Services

- **OCR Service**: Bill extraction from images
- **Sync Service**: Real-time cloud sync
- **Gamification Service**: Badges, levels, streaks
- **Notification Service**: Smart reminders
- **Export Service**: PDF, Excel, JSON, CSV exports
- **India-First Service**: UPI, SMS, rent splitting

## Native Modules

### Installed Libraries
- `react-native-html-to-pdf` - PDF export
- `xlsx` - Excel export
- `react-native-fs` - File system access
- `react-native-image-picker` - Image capture

### Linking
Native modules are auto-linked. If issues occur:
```bash
cd android && ./gradlew clean
```

## Testing

```bash
# Type check
npx tsc --noEmit --skipLibCheck

# Build Android
pnpm run android
```

## Deployment

1. Update version in `package.json`
2. Build release APK:
```bash
cd android && ./gradlew assembleRelease
```

## Troubleshooting

### Metro bundler issues
```bash
pnpm start --reset-cache
```

### Android build issues
```bash
cd android && ./gradlew clean
```

### Native module issues
Check `android/app/build.gradle` for proper linking.
