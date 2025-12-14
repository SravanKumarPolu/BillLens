# Python Backend Setup Guide

## Overview

The Python backend provides **enhanced OCR capabilities** with image preprocessing and automation scripts. It's **completely optional** - the mobile app works perfectly without it, but the backend enhances accuracy for difficult images.

## ✅ What's Included

1. **FastAPI OCR Service** - Enhanced OCR with image preprocessing
2. **Automation Scripts** - SMS parsing, batch processing, data migration
3. **Mobile App Integration** - Optional enhancement (keeps existing functionality)

## 🚀 Quick Start

### 1. Install Python Dependencies

```bash
cd python-backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure (Optional)

```bash
cp .env.example .env
# Edit .env if you want to use Google Vision API
```

### 3. Start the Server

```bash
./start.sh
# Or: python main.py
```

The service will be available at `http://localhost:8000`

## 📱 Enable in Mobile App

Edit `src/config/ocrConfig.ts`:

```typescript
export const getOCRConfig = (): OCRConfig => {
  return {
    pythonBackendUrl: 'http://localhost:8000', // Your backend URL
    usePythonBackend: true, // Enable Python backend
    fallbackToGoogleVision: true, // Fallback if backend fails
    useMock: false,
  };
};
```

**Important**: The app will automatically fallback to existing methods if the Python backend is unavailable. No breaking changes!

## 🔧 OCR Engines

### Option 1: Google Cloud Vision API (Recommended)

1. Create Google Cloud project
2. Enable Vision API
3. Create service account → Download JSON
4. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`

### Option 2: Tesseract OCR (Free, Local)

```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt-get install tesseract-ocr
```

## 📜 Automation Scripts

### SMS Parser

```bash
python scripts/sms_parser.py
```

Parses SMS messages to extract bill information automatically.

### Batch Processor

```bash
python scripts/batch_processor.py <directory> [output.json]
```

Process multiple bill images in batch.

### Data Migration

```bash
python scripts/data_migration.py migrate <input.json> <output.json>
python scripts/data_migration.py validate <data.json>
```

## 🎯 Features

### Image Preprocessing
- ✅ Automatic image enhancement
- ✅ Denoising and sharpening
- ✅ Contrast enhancement
- ✅ Deskewing (straighten rotated text)
- ✅ Specialized bill/receipt preprocessing

### Multiple OCR Engines
- ✅ Google Vision API (high accuracy)
- ✅ Tesseract OCR (free, local)
- ✅ Automatic fallback

### Batch Processing
- ✅ Process multiple images
- ✅ Export results to JSON
- ✅ Error handling per image

## 🔒 Privacy & Security

- All processing happens on your server
- No data is stored permanently
- Images are processed and discarded
- Compatible with offline-first mobile app

## 🚨 Important Notes

1. **Optional Enhancement**: The mobile app works perfectly without the Python backend
2. **Automatic Fallback**: If backend is unavailable, app uses existing methods
3. **No Breaking Changes**: All existing features remain intact
4. **Development Ready**: Can use mock mode for testing

## 📊 Performance

- **Single Image**: ~1-2 seconds (with preprocessing)
- **Batch Processing**: ~1-2 seconds per image
- **Preprocessing**: Adds ~200-500ms per image

## 🐛 Troubleshooting

### Backend not connecting?
- Check if server is running: `curl http://localhost:8000/health`
- Verify URL in `ocrConfig.ts`
- Check CORS settings (backend allows all origins by default)

### OCR not working?
- Check if OCR engine is installed (Tesseract) or configured (Google Vision)
- See `python-backend/README.md` for detailed setup

### Image upload fails?
- Verify image format (JPEG, PNG supported)
- Check file size (backend handles up to 10MB by default)

## 📚 API Documentation

Once running, visit:
- `http://localhost:8000/docs` - Interactive API documentation
- `http://localhost:8000/health` - Health check

## 🎉 That's It!

The Python backend is now ready. The mobile app will automatically use it when enabled, with seamless fallback to existing methods.
