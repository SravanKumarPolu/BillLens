"""
OCR Service
Supports multiple OCR engines with fallback
"""

import os
from typing import Dict, Optional, List
import base64
import io
from PIL import Image

# Optional imports (install if needed)
try:
    from google.cloud import vision
    GOOGLE_VISION_AVAILABLE = True
except ImportError:
    GOOGLE_VISION_AVAILABLE = False

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


class OCRService:
    """OCR service with multiple engine support"""
    
    def __init__(self):
        self.google_vision_client = None
        if GOOGLE_VISION_AVAILABLE:
            try:
                # Initialize Google Vision client if credentials are available
                credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                if credentials_path and os.path.exists(credentials_path):
                    self.google_vision_client = vision.ImageAnnotatorClient()
                    print("✅ Google Vision API initialized successfully")
                else:
                    print("⚠️  GOOGLE_APPLICATION_CREDENTIALS not set or file not found")
                    print("   Set it with: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json")
            except Exception as e:
                print(f"❌ Google Vision initialization failed: {e}")
                print("   Make sure you've enabled Vision API and downloaded service account JSON")
    
    def get_available_engines(self) -> List[str]:
        """Get list of available OCR engines"""
        engines = []
        if GOOGLE_VISION_AVAILABLE and self.google_vision_client:
            engines.append("google_vision")
        if TESSERACT_AVAILABLE:
            engines.append("tesseract")
        return engines
    
    async def extract_text(
        self,
        image_data: bytes,
        engine: str = "auto"
    ) -> Dict:
        """
        Extract text from image using specified OCR engine
        
        Args:
            image_data: Image bytes
            engine: OCR engine to use (google_vision, tesseract, auto)
        
        Returns:
            Dictionary with extracted text and metadata
        """
        if engine == "auto":
            engine = self._select_best_engine()
        
        try:
            if engine == "google_vision":
                return await self._extract_with_google_vision(image_data)
            elif engine == "tesseract":
                return await self._extract_with_tesseract(image_data)
            else:
                raise ValueError(f"Unknown OCR engine: {engine}")
        
        except Exception as e:
            # Fallback to alternative engine
            if engine != "tesseract" and TESSERACT_AVAILABLE:
                try:
                    return await self._extract_with_tesseract(image_data)
                except Exception:
                    pass
            
            raise Exception(f"OCR extraction failed: {str(e)}")
    
    def _select_best_engine(self) -> str:
        """Select the best available OCR engine"""
        if GOOGLE_VISION_AVAILABLE and self.google_vision_client:
            return "google_vision"
        elif TESSERACT_AVAILABLE:
            return "tesseract"
        else:
            raise Exception("No OCR engines available. Install Google Vision or Tesseract.")
    
    async def _extract_with_google_vision(self, image_data: bytes) -> Dict:
        """Extract text using Google Cloud Vision API"""
        if not self.google_vision_client:
            raise Exception("Google Vision client not initialized")
        
        try:
            image = vision.Image(content=image_data)
            response = self.google_vision_client.text_detection(image=image)
            
            if response.error.message:
                raise Exception(f"Google Vision API error: {response.error.message}")
            
            texts = response.text_annotations
            if texts:
                full_text = texts[0].description
                
                return {
                    "text": full_text,
                    "engine": "google_vision",
                    "confidence": 0.95,  # Google Vision doesn't provide per-word confidence
                    "raw_response": {
                        "detected_text": full_text,
                        "text_count": len(texts) - 1  # First is full text, rest are words
                    }
                }
            else:
                return {
                    "text": "",
                    "engine": "google_vision",
                    "confidence": 0.0,
                    "raw_response": {}
                }
        
        except Exception as e:
            raise Exception(f"Google Vision extraction failed: {str(e)}")
    
    async def _extract_with_tesseract(self, image_data: bytes) -> Dict:
        """Extract text using Tesseract OCR"""
        if not TESSERACT_AVAILABLE:
            raise Exception("Tesseract not available")
        
        try:
            # Convert bytes to PIL Image
            image = Image.open(io.BytesIO(image_data))
            
            # Extract text with confidence scores
            data = pytesseract.image_to_data(
                image,
                output_type=pytesseract.Output.DICT,
                lang='eng'  # Add 'hin' for Hindi support if needed
            )
            
            # Combine all text
            text_parts = []
            confidences = []
            
            for i in range(len(data['text'])):
                text = data['text'][i].strip()
                conf = int(data['conf'][i])
                
                if text and conf > 0:
                    text_parts.append(text)
                    confidences.append(conf)
            
            full_text = ' '.join(text_parts)
            avg_confidence = sum(confidences) / len(confidences) / 100.0 if confidences else 0.0
            
            return {
                "text": full_text,
                "engine": "tesseract",
                "confidence": avg_confidence,
                "raw_response": {
                    "detected_text": full_text,
                    "word_count": len(text_parts),
                    "average_confidence": avg_confidence
                }
            }
        
        except Exception as e:
            raise Exception(f"Tesseract extraction failed: {str(e)}")
    
    async def extract_with_confidence_scores(self, image_data: bytes) -> Dict:
        """
        Extract text with detailed confidence scores per word
        
        Returns additional metadata for better parsing
        """
        result = await self.extract_text(image_data, engine="auto")
        
        # Add parsing hints
        result["parsing_hints"] = {
            "has_amounts": "₹" in result["text"] or "Rs" in result["text"],
            "has_dates": any(keyword in result["text"].lower() for keyword in ["date", "time", "/", "-"]),
            "has_merchant": len(result["text"].split("\n")) > 0,
            "line_count": len(result["text"].split("\n"))
        }
        
        return result
