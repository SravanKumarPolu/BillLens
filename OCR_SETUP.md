# OCR Setup Guide - No Backend Required

## Overview

BillLens uses **client-side OCR** - no backend server needed! This keeps costs low and ensures privacy.

## Architecture

The app uses a smart fallback chain:
1. **Google Vision API** (primary) - Client-side API calls
2. **On-device OCR** (offline fallback) - Works without internet
3. **Mock OCR** (development) - For testing without API keys

## Quick Setup

### Option 1: Google Vision API (Recommended for Production)

**Cost**: First 1,000 requests/month FREE, then $1.50 per 1,000 requests

1. **Get API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or use existing)
   - Enable "Cloud Vision API"
   - Go to "Credentials" → "Create Credentials" → "API Key"
   - Copy your API key

2. **Configure in App**:
   
   Edit `src/config/ocrConfig.ts`:
   ```typescript
   export const getOCRConfig = (): OCRConfig => {
     return {
       ...defaultOCRConfig,
       googleVisionApiKey: 'YOUR_API_KEY_HERE',
       useGoogleVision: true,
       useOnDeviceOCR: true, // Fallback for offline
       useMock: false,
     };
   };
   ```

3. **Secure Your API Key** (Production):
   - For production, store API key in secure storage or environment variables
   - Consider using API key restrictions in Google Cloud Console
   - Restrict API key to "Cloud Vision API" only

### Option 2: On-Device OCR (Free, Offline)

**Cost**: Completely FREE, works offline

1. **Install ML Kit**:
   ```bash
   npm install @react-native-ml-kit/text-recognition
   ```

2. **iOS Setup**:
   ```bash
   cd ios && pod install
   ```

3. **Android Setup**:
   - Already configured in `android/app/build.gradle`

4. **Enable in Config**:
   ```typescript
   export const getOCRConfig = (): OCRConfig => {
     return {
       ...defaultOCRConfig,
       useGoogleVision: false,
       useOnDeviceOCR: true,
       useMock: false,
     };
   };
   ```

5. **Update OCR Service**:
   - Uncomment the on-device OCR implementation in `src/utils/ocrService.ts`
   - The code is already there, just needs the package installed

### Option 3: Mock OCR (Development)

**Cost**: FREE, for development only

Perfect for testing without API keys:

```typescript
export const getOCRConfig = (): OCRConfig => {
  return {
    ...defaultOCRConfig,
    useMock: true, // Enable mock mode
  };
};
```

## Cost Comparison

| Method | Monthly Cost | Setup | Offline Support |
|--------|-------------|-------|-----------------|
| Google Vision API | $0-5 (free tier) | Easy | ❌ Requires internet |
| On-device OCR | $0 | Medium | ✅ Works offline |
| Mock OCR | $0 | None | ✅ Works offline |

## Recommended Setup

### For Development:
- Use **Mock OCR** - no setup needed, works immediately

### For Production (Free Tier):
- Use **Google Vision API** - first 1,000 requests/month free
- Enable **On-device OCR** as fallback for offline use

### For Production (High Volume):
- Use **Google Vision API** - $1.50 per 1,000 requests
- Consider caching results to reduce API calls

## API Key Security

### Development:
- Store API key directly in config (not committed to git)

### Production:
- Use environment variables or secure storage
- Restrict API key in Google Cloud Console:
  - Application restrictions: Android/iOS app
  - API restrictions: Cloud Vision API only
  - Set usage quotas to prevent abuse

## Troubleshooting

### Google Vision API not working?
- Check API key is correct
- Verify Cloud Vision API is enabled
- Check API key restrictions
- Verify internet connection

### On-device OCR not working?
- Ensure `@react-native-ml-kit/text-recognition` is installed
- Run `pod install` (iOS) or rebuild (Android)
- Check device has sufficient storage

### Mock OCR always used?
- Check `useMock` is set to `false` in config
- Verify `googleVisionApiKey` is set (if using Google Vision)
- Check console for error messages

## Migration from Python Backend

If you were using the Python backend:

1. **Remove Python backend code** (already done)
2. **Set up Google Vision API** (see Option 1 above)
3. **Update config** to use new architecture
4. **Test OCR** - should work the same, but faster!

## Benefits of No-Backend Approach

✅ **Zero server costs** - no hosting needed  
✅ **Better privacy** - data never leaves device  
✅ **Faster** - no network latency  
✅ **Simpler** - less infrastructure to maintain  
✅ **Offline support** - on-device OCR works without internet  
✅ **Scalable** - Google handles scaling automatically  

## Next Steps

1. Choose your OCR method (Google Vision recommended)
2. Set up API key (if using Google Vision)
3. Test OCR in the app
4. Monitor usage in Google Cloud Console (if using Google Vision)

---

**That's it!** No backend server needed. Everything works client-side. 🎉
