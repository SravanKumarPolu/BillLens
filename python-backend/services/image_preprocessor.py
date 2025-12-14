"""
Image Preprocessing Service
Enhances image quality for better OCR accuracy
"""

import cv2
import numpy as np
from PIL import Image
import io


class ImagePreprocessor:
    """Preprocesses images to improve OCR accuracy"""
    
    def preprocess(self, image_data: bytes) -> bytes:
        """
        Preprocess image for better OCR results
        
        Args:
            image_data: Raw image bytes
        
        Returns:
            Preprocessed image bytes
        """
        try:
            # Convert bytes to numpy array
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return image_data  # Return original if decoding fails
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply denoising
            denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
            
            # Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(denoised)
            
            # Apply thresholding (adaptive)
            thresh = cv2.adaptiveThreshold(
                enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            
            # Optional: Deskew (straighten rotated text)
            deskewed = self._deskew(thresh)
            
            # Convert back to bytes
            _, encoded_img = cv2.imencode('.png', deskewed)
            return encoded_img.tobytes()
        
        except Exception as e:
            print(f"Preprocessing error: {e}")
            return image_data  # Return original on error
    
    def _deskew(self, image: np.ndarray) -> np.ndarray:
        """Deskew (straighten) rotated text in image"""
        try:
            # Find all non-zero points
            coords = np.column_stack(np.where(image > 0))
            
            if len(coords) == 0:
                return image
            
            # Find minimum area rectangle
            angle = cv2.minAreaRect(coords)[-1]
            
            # Correct angle
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            
            # If angle is significant, rotate
            if abs(angle) > 0.5:
                (h, w) = image.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                rotated = cv2.warpAffine(
                    image, M, (w, h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE
                )
                return rotated
            
            return image
        
        except Exception:
            return image
    
    def enhance_for_bills(self, image_data: bytes) -> bytes:
        """
        Specialized preprocessing for bill/receipt images
        
        Optimized for:
        - Receipt paper (white background)
        - Printed text (high contrast)
        - Common bill formats
        """
        try:
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return image_data
            
            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply Gaussian blur to reduce noise
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            
            # Sharpen image
            kernel = np.array([[-1, -1, -1],
                              [-1,  9, -1],
                              [-1, -1, -1]])
            sharpened = cv2.filter2D(blurred, -1, kernel)
            
            # Enhance contrast
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(sharpened)
            
            # Binary threshold for clear text
            _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # Convert back to bytes
            _, encoded_img = cv2.imencode('.png', thresh)
            return encoded_img.tobytes()
        
        except Exception as e:
            print(f"Bill enhancement error: {e}")
            return image_data
