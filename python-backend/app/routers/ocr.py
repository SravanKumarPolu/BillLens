"""
OCR Router
Handles receipt OCR and parsing
"""

from fastapi import APIRouter, HTTPException, File, UploadFile, Form, Query
from typing import Optional
import base64
import sys
import os
from pathlib import Path

# Add services directory to path
backend_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_root))

from app.core.schemas import (
    OCRRequest, OCRResponse, RawOCRResponse, 
    ParsedReceiptResponse, SplitSuggestion
)
from services.ocr_service import OCRService
from services.image_preprocessor import ImagePreprocessor
from services.receipt_parser import ReceiptParser

router = APIRouter()
ocr_service = OCRService()
preprocessor = ImagePreprocessor()
receipt_parser = ReceiptParser()


@router.post("/google", response_model=RawOCRResponse)
async def extract_raw_text(
    file: UploadFile = File(...),
    use_preprocessing: Optional[str] = Form(None)  # Accept as string from FormData, convert to bool
):
    """
    PHASE 1: Extract raw text from receipt image using Google Vision API
    
    This is the first step - just get raw text, store in AsyncStorage OCR History.
    
    Accepts multipart/form-data with:
    - file: Image file
    - use_preprocessing: "true" or "false" (optional, defaults to True)
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read image data
        image_data = await file.read()
        
        # Convert use_preprocessing string to bool (FormData sends strings)
        should_preprocess = True  # Default
        if use_preprocessing is not None:
            should_preprocess = use_preprocessing.lower() in ('true', '1', 'yes')
        
        # Preprocess image if enabled
        if should_preprocess:
            image_data = preprocessor.enhance_for_bills(image_data)
        
        # Perform OCR with Google Vision
        ocr_result = await ocr_service.extract_text(
            image_data=image_data,
            engine="google_vision"  # Force Google Vision for this endpoint
        )
        
        if not ocr_result or "text" not in ocr_result:
            raise HTTPException(status_code=500, detail="OCR extraction failed")
        
        return RawOCRResponse(
            raw_text=ocr_result.get("text", ""),
            engine=ocr_result.get("engine", "google_vision"),
            confidence=ocr_result.get("confidence", 0.0)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@router.post("/parse", response_model=OCRResponse)
async def parse_receipt(payload: OCRRequest):
    """
    PHASE 2: Parse receipt from base64 image
    
    Returns structured data: merchant, total, items, etc.
    """
    try:
        # Decode base64 image
        try:
            image_data = base64.b64decode(payload.image_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")
        
        # Preprocess image
        image_data = preprocessor.enhance_for_bills(image_data)
        
        # Perform OCR
        ocr_result = await ocr_service.extract_text(
            image_data=image_data,
            engine="auto"
        )
        
        if not ocr_result or "text" not in ocr_result:
            raise HTTPException(status_code=500, detail="OCR extraction failed")
        
        raw_text = ocr_result.get("text", "")
        confidence = ocr_result.get("confidence", 0.0)
        
        # Parse receipt text to extract structured data
        parsed = receipt_parser.parse(raw_text, hint=payload.hint, currency=payload.currency)
        
        # Return structured response (subtotal already calculated in parser)
        return OCRResponse(
            merchant=parsed.get("merchant", "Unknown Merchant"),
            currency=payload.currency,
            subtotal=parsed.get("subtotal"),
            total=parsed.get("total", 0.0),
            items=parsed.get("items", []),
            date=parsed.get("date"),
            time=parsed.get("time"),
            tax=parsed.get("tax"),
            delivery_fee=parsed.get("delivery_fee"),
            platform_fee=parsed.get("platform_fee"),
            discount=parsed.get("discount"),
            confidence=confidence,
            raw_text=raw_text[:500] if raw_text else None  # First 500 chars
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Receipt parsing failed: {str(e)}")


@router.post("/parse-with-split", response_model=ParsedReceiptResponse)
async def parse_with_split_suggestions(
    payload: OCRRequest,
    member_ids: Optional[str] = None  # Comma-separated member IDs
):
    """
    PHASE 4: Parse receipt and suggest auto-split
    
    Returns parsed receipt + split suggestions based on members.
    """
    try:
        # Decode base64 image
        try:
            image_data = base64.b64decode(payload.image_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")
        
        # Preprocess and OCR
        image_data = preprocessor.enhance_for_bills(image_data)
        ocr_result = await ocr_service.extract_text(image_data=image_data, engine="auto")
        
        if not ocr_result or "text" not in ocr_result:
            raise HTTPException(status_code=500, detail="OCR extraction failed")
        
        raw_text = ocr_result.get("text", "")
        confidence = ocr_result.get("confidence", 0.0)
        
        # Parse receipt
        parsed = receipt_parser.parse(raw_text, hint=payload.hint, currency=payload.currency)
        
        # Generate split suggestions
        suggested_split = None
        if member_ids:
            member_list = [m.strip() for m in member_ids.split(",") if m.strip()]
            if member_list:
                split_result = receipt_parser.suggest_split(
                    total=parsed.get("total", 0.0),
                    items=parsed.get("items", []),
                    member_ids=member_list
                )
                if split_result:
                    suggested_split = SplitSuggestion(
                        type=split_result.get("type", "equal"),
                        amount_per_person=split_result.get("amount_per_person"),
                        splits=split_result.get("splits"),
                        explanation=split_result.get("explanation", "")
                    )
        
        return ParsedReceiptResponse(
            merchant=parsed.get("merchant", "Unknown Merchant"),
            currency=payload.currency,
            subtotal=parsed.get("subtotal"),
            total=parsed.get("total", 0.0),
            items=parsed.get("items", []),
            date=parsed.get("date"),
            time=parsed.get("time"),
            tax=parsed.get("tax"),
            delivery_fee=parsed.get("delivery_fee"),
            platform_fee=parsed.get("platform_fee"),
            discount=parsed.get("discount"),
            confidence=confidence,
            raw_text=raw_text[:500] if raw_text else None,
            suggested_split=suggested_split
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Receipt parsing failed: {str(e)}")
