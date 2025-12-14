# Google Cloud Vision API Setup Guide

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it: `billlens-ocr` (or your preferred name)
4. Click "Create"

### 2. Enable Vision API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Cloud Vision API"
3. Click on it and click **Enable**

### 3. Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Name: `billlens-ocr-service`
4. Description: "Service account for BillLens OCR"
5. Click **Create and Continue**
6. Skip role assignment (click **Continue**)
7. Click **Done**

### 4. Create and Download Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create**
6. The JSON file will download automatically

### 5. Set Environment Variable

**On macOS/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
```

**On Windows:**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\service-account.json
```

**For permanent setup, add to your shell profile:**

**macOS/Linux (`~/.zshrc` or `~/.bashrc`):**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/yourname/Downloads/service-account.json"
```

**Then reload:**
```bash
source ~/.zshrc  # or source ~/.bashrc
```

### 6. Verify Setup

```bash
cd python-backend
python3 -c "from google.cloud import vision; print('✅ Google Vision API ready!')"
```

If you see the checkmark, you're all set!

## Security Best Practices

### ✅ DO:
- Keep the JSON file in a secure location
- Add `service-account.json` to `.gitignore`
- Use environment variables (never commit credentials)
- Restrict API key permissions in Google Cloud Console

### ❌ DON'T:
- Commit the JSON file to git
- Share the JSON file publicly
- Use the same key for production and development

## Testing

Once set up, test the OCR endpoint:

```bash
# Start the backend
cd python-backend
python -m app.main

# In another terminal, test with curl
curl -X POST http://localhost:8000/ocr/google \
  -F "file=@/path/to/receipt.jpg" \
  -F "use_preprocessing=true"
```

You should get back raw text from the receipt!

## Troubleshooting

### Error: "Could not automatically determine credentials"

**Solution**: Make sure `GOOGLE_APPLICATION_CREDENTIALS` is set correctly:
```bash
echo $GOOGLE_APPLICATION_CREDENTIALS
# Should show the path to your JSON file
```

### Error: "Permission denied"

**Solution**: Check that the service account has Vision API enabled and the JSON file is readable:
```bash
ls -la /path/to/service-account.json
chmod 600 /path/to/service-account.json  # Restrict permissions
```

### Error: "API not enabled"

**Solution**: Go to Google Cloud Console → APIs & Services → Enable "Cloud Vision API"

## Cost Information

Google Cloud Vision API pricing (as of 2024):
- **First 1,000 units/month**: FREE
- **1,001-5,000,000 units**: $1.50 per 1,000 units
- **5,000,001+ units**: $0.60 per 1,000 units

*1 unit = 1 image with up to 10 pages*

For BillLens, you'll likely stay in the free tier for a while!

## Next Steps

Once setup is complete:
1. ✅ Backend will automatically use Google Vision API
2. ✅ OCR will be more accurate than Tesseract
3. ✅ No code changes needed - it just works!
