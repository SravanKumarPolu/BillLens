# BillLens Python Backend

FastAPI backend for BillLens providing OCR, settlement validation, and sync capabilities.

## Features

- ✅ **Structured OCR Parsing** - Extract merchant, total, items, fees from receipts
- ✅ **Settlement Validation** - Validate balances and audit settlement logic
- ✅ **Cloud Sync** - Push/pull data endpoints (ready for database integration)
- ✅ **Local Scripts** - Validate bills and export to CSV

## Installation

```bash
cd python-backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running the Server

```bash
# Development
python -m app.main

# Or using uvicorn directly
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### OCR

**POST `/ocr/google`** (PHASE 1: Raw Text Extraction)
- Extract raw text from receipt image using Google Vision API
- Accepts: `multipart/form-data` with `file` field
- Returns: `{ raw_text: string, engine: string, confidence: float }`

```bash
curl -X POST http://localhost:8000/ocr/google \
  -F "file=@receipt.jpg" \
  -F "use_preprocessing=true"
```

**POST `/ocr/parse`** (PHASE 2: Structured Parsing)
- Parse receipt from base64 image
- Returns structured data: merchant, total, items, fees

```json
{
  "image_base64": "base64_encoded_image",
  "currency": "INR",
  "hint": "swiggy"  // optional
}
```

**POST `/ocr/parse-with-split`** (PHASE 4: Parse + Split Suggestions)
- Parse receipt and suggest auto-split
- Query param: `member_ids=user1,user2` (comma-separated)
- Returns: Parsed receipt + split suggestions

```json
{
  "image_base64": "base64_encoded_image",
  "currency": "INR",
  "hint": "swiggy"
}
```

### Settlement Validation

**POST `/settlement/validate`**
- Validate settlement logic
- Compute balances and audit trail

```json
{
  "members": [{"id": "user1", "name": "User 1"}],
  "expenses": [{"id": "e1", "paid_by": "user1", "amount": 100, "splits": {"user1": 50, "user2": 50}}],
  "settlements": []
}
```

### Sync

**POST `/sync/push`** - Push data to server
**GET `/sync/pull?user_id=xxx`** - Pull data from server

## Local Scripts

### Validate Bills

```bash
python scripts/validate_bills.py export.json
```

Validates settlement logic from exported JSON and checks if balances sum to zero.

### Export CSV

```bash
python scripts/export_csv.py export.json
```

Exports expenses, settlements, and balances to CSV files.

## Project Structure

```
python-backend/
├── app/
│   ├── main.py           # FastAPI app
│   ├── routers/          # API routes
│   │   ├── ocr.py
│   │   ├── settlement.py
│   │   └── sync.py
│   └── core/             # Core modules
│       ├── schemas.py    # Pydantic models
│       └── security.py   # Security utilities
├── services/             # Business logic
│   ├── ocr_service.py
│   ├── image_preprocessor.py
│   └── receipt_parser.py
├── scripts/              # Local scripts
│   ├── validate_bills.py
│   └── export_csv.py
└── requirements.txt
```

## Integration with Mobile App

The mobile app can optionally use this backend. See `src/config/ocrConfig.ts` for configuration.

**Android Emulator**: Use `http://10.0.2.2:8000`  
**iOS Simulator**: Use `http://localhost:8000`  
**Physical Device**: Use your computer's IP address

## Next Steps

1. **Database Integration**: Replace in-memory storage with Postgres/Supabase
2. **Authentication**: Add API key or JWT authentication
3. **Real OCR**: Integrate Google Vision API or AWS Textract
4. **Error Handling**: Enhanced error responses
5. **Logging**: Add structured logging

## Development

```bash
# Run with auto-reload
uvicorn app.main:app --reload

# Run tests (when added)
pytest

# Format code
black .
```
