"""
Receipt Parser
Parses OCR text to extract structured bill information
Based on TypeScript parsing logic in src/utils/ocrService.ts
"""

import re
import sys
import os
from typing import Dict, List, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

try:
    from app.core.schemas import LineItem
except ImportError:
    # Fallback if running as standalone
    from pydantic import BaseModel
    
    class LineItem(BaseModel):
        name: str
        qty: float = 1.0
        price: float


class ReceiptParser:
    """Parse receipt text to extract structured data"""
    
    # Known Indian merchants
    KNOWN_MERCHANTS = {
        'swiggy', 'zomato', 'uber eats', 'blinkit', 'bigbasket', 'zepto',
        'phonepe', 'google pay', 'paytm', 'bhim', 'cred',
        'amazon', 'flipkart', 'myntra',
        'domino', 'pizza hut', 'kfc', 'mcdonald'
    }
    
    def parse(self, text: str, hint: Optional[str] = None, currency: str = "INR") -> Dict:
        """
        Parse receipt text and extract structured data
        
        Returns:
            {
                "merchant": str,
                "total": float,
                "items": List[LineItem],
                "date": Optional[str],
                "time": Optional[str],
                "tax": Optional[float],
                "delivery_fee": Optional[float],
                "platform_fee": Optional[float],
                "discount": Optional[float],
            }
        """
        if not text:
            return {"merchant": "Unknown", "total": 0.0, "items": []}
        
        normalized = text.lower()
        
        # Extract merchant
        merchant = self._extract_merchant(text, normalized, hint)
        
        # Extract total amount
        total = self._extract_amount(normalized)
        
        # Extract date and time
        date = self._extract_date(text)
        time = self._extract_time(text)
        
        # Extract items (for food delivery bills)
        items = self._extract_items(text, normalized)
        
        # Extract fees and taxes
        tax = self._extract_tax(normalized)
        delivery_fee = self._extract_delivery_fee(normalized)
        platform_fee = self._extract_platform_fee(normalized)
        discount = self._extract_discount(normalized)
        
        # Calculate subtotal (items sum, or total - tax - fees + discount)
        subtotal = None
        if items and len(items) > 0:
            # Calculate from items
            items_sum = sum(item.price * item.qty for item in items)
            subtotal = items_sum
        else:
            # Calculate from total - fees + discount
            subtotal = total
            if tax:
                subtotal -= tax
            if delivery_fee:
                subtotal -= delivery_fee
            if platform_fee:
                subtotal -= platform_fee
            if discount:
                subtotal += discount
            subtotal = max(0, subtotal)  # Ensure non-negative
        
        return {
            "merchant": merchant,
            "currency": currency,
            "subtotal": subtotal,
            "total": total,
            "items": items,
            "date": date,
            "time": time,
            "tax": tax,
            "delivery_fee": delivery_fee,
            "platform_fee": platform_fee,
            "discount": discount,
        }
    
    def _extract_merchant(self, text: str, normalized: str, hint: Optional[str]) -> str:
        """Extract merchant name"""
        # Use hint if provided
        if hint:
            return hint.title()
        
        # Check known merchants
        for merchant in self.KNOWN_MERCHANTS:
            if merchant in normalized:
                return merchant.title()
        
        # Extract from first line (common pattern)
        lines = text.split('\n')
        if lines:
            first_line = lines[0].strip()
            if first_line and len(first_line) < 50:  # Reasonable merchant name length
                return first_line
        
        return "Unknown Merchant"
    
    def _extract_amount(self, normalized: str) -> float:
        """
        Extract total amount with priority-based detection
        Removes duplicates and uses context-aware priority
        """
        # Priority patterns (higher priority = more likely to be final total)
        # Pattern format: (priority, regex, context)
        patterns = [
            (10, r'(?:grand\s+total|final\s+amount|amount\s+paid|total\s+payable|pay\s+amount|amount\s+to\s+pay|net\s+amount)[\s:]*₹?\s*([\d,]+\.?\d*)', 'Grand Total'),
            (9, r'(?:bill\s+total|total\s+bill|final\s+bill|amount\s+payable)[\s:]*₹?\s*([\d,]+\.?\d*)', 'Restaurant Bill'),
            (9, r'(?:total\s+due|amount\s+due|bill\s+amount|outstanding|balance\s+due)[\s:]*₹?\s*([\d,]+\.?\d*)', 'Utility Bill'),
            (8, r'(?:amount|paid|transaction\s+amount|payment\s+amount)[\s:]*₹\s*([\d,]+\.?\d*)', 'UPI Payment'),
            (7, r'(?:^|\n)\s*total[\s:]*₹?\s*([\d,]+\.?\d*)', 'Total'),
            (3, r'₹\s*([\d,]+\.?\d*)', 'Currency Symbol'),
        ]
        
        candidates = []
        seen_amounts = set()  # Track seen amounts to avoid duplicates
        
        for priority, pattern, context in patterns:
            matches = re.finditer(pattern, normalized, re.IGNORECASE)
            for match in matches:
                # Handle comma-separated amounts like ₹1,299.00
                amount_str = match.group(1).replace(',', '')
                try:
                    amount = float(amount_str)
                    # Validate reasonable range
                    if 10 <= amount <= 100000:
                        # Avoid duplicates - only add if not seen before
                        amount_key = round(amount, 2)  # Round to avoid float precision issues
                        if amount_key not in seen_amounts:
                            seen_amounts.add(amount_key)
                            candidates.append({
                                'amount': amount,
                                'priority': priority,
                                'context': context
                            })
                except ValueError:
                    continue
        
        if not candidates:
            return 0.0
        
        # Sort by priority (highest first), then by amount (largest first for same priority)
        candidates.sort(key=lambda x: (-x['priority'], -x['amount']))
        
        # Return the highest priority amount (or largest if same priority)
        return candidates[0]['amount']
    
    def _extract_date(self, text: str) -> Optional[str]:
        """Extract date from text"""
        # Common date patterns
        patterns = [
            r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})',  # DD/MM/YYYY
            r'(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{2,4})',  # DD MMM YYYY
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    if '/' in match.group(0) or '-' in match.group(0):
                        day, month, year = match.groups()
                        if len(year) == 2:
                            year = '20' + year
                        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                except:
                    pass
        
        return None
    
    def _extract_time(self, text: str) -> Optional[str]:
        """Extract time from text"""
        # Time patterns
        patterns = [
            r'(\d{1,2}):(\d{2})\s*(am|pm)?',  # HH:MM AM/PM
            r'time[:\s]+(\d{1,2}):(\d{2})',  # Time: HH:MM
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    hour = int(match.group(1))
                    minute = match.group(2)
                    if len(match.groups()) > 2 and match.group(3):
                        # AM/PM format
                        am_pm = match.group(3).lower()
                        if am_pm == 'pm' and hour < 12:
                            hour += 12
                        elif am_pm == 'am' and hour == 12:
                            hour = 0
                    return f"{hour:02d}:{minute}"
                except:
                    pass
        
        return None
    
    def _extract_items(self, text: str, normalized: str) -> List[LineItem]:
        """
        Extract line items from food delivery bills
        Improved patterns, better filtering, removes duplicates
        """
        items = []
        seen_items = set()  # Track seen items to avoid duplicates
        
        # Summary line keywords to exclude
        summary_keywords = {
            'subtotal', 'total', 'tax', 'delivery', 'discount', 'grand',
            'amount', 'paid', 'gst', 'vat', 'cgst', 'sgst', 'igst',
            'platform', 'convenience', 'service', 'fee', 'charges',
            'offer', 'promo', 'savings', 'you saved', 'packing',
            'tip', 'service charge', 'bill total', 'final amount'
        }
        
        # Enhanced item patterns (multiple patterns for better coverage)
        item_patterns = [
            # Pattern 1: "2x Item Name ₹500" or "2 x Item Name ₹500"
            (r'(\d+)\s*x\s*([^₹\n]+?)\s*₹\s*([\d,]+\.?\d*)', True),
            # Pattern 2: "Item Name ₹500" (single item, price at end)
            (r'([A-Z][^₹\n]{2,50}?)\s+₹\s*([\d,]+\.?\d*)', False),
            # Pattern 3: "Item Name - ₹500" (with dash)
            (r'([A-Z][^₹\n]{2,50}?)\s*-\s*₹\s*([\d,]+\.?\d*)', False),
            # Pattern 4: "Item Name (₹500)" (with parentheses)
            (r'([A-Z][^₹\n]{2,50}?)\s*\(\s*₹\s*([\d,]+\.?\d*)\s*\)', False),
            # Pattern 5: "Item Name ₹500.00" (with decimal)
            (r'([A-Za-z][^₹\n]{2,50}?)\s*₹\s*([\d,]+\.[\d]{2})', False),
        ]
        
        lines = text.split('\n')
        
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped or len(line_stripped) < 5:
                continue
            
            line_lower = line_stripped.lower()
            
            # Skip summary lines early
            if any(keyword in line_lower for keyword in summary_keywords):
                continue
            
            # Try each pattern
            for pattern, has_qty in item_patterns:
                matches = re.finditer(pattern, line_stripped, re.IGNORECASE)
                for match in matches:
                    try:
                        if has_qty:
                            qty_str = match.group(1)
                            name = match.group(2).strip()
                            price_str = match.group(3)
                        else:
                            qty_str = '1'
                            name = match.group(1).strip()
                            price_str = match.group(2)
                        
                        # Clean name - remove extra spaces, dashes at end
                        name = re.sub(r'\s+', ' ', name).strip()
                        name = re.sub(r'[-\s]+$', '', name)
                        
                        # Validate name (not a summary line)
                        name_lower = name.lower()
                        if any(keyword in name_lower for keyword in summary_keywords):
                            continue
                        
                        # Validate name length
                        if len(name) < 2 or len(name) > 50:
                            continue
                        
                        # Handle comma-separated amounts like ₹1,299.00
                        price_str_clean = price_str.replace(',', '')
                        price = float(price_str_clean)
                        qty = float(qty_str) if qty_str else 1.0
                        
                        # Validate price range
                        if price <= 0 or price >= 10000:
                            continue
                        
                        # Calculate price per item
                        price_per_item = price / qty if qty > 0 else price
                        
                        # Create unique key to avoid duplicates
                        item_key = (name.lower(), round(price_per_item, 2))
                        if item_key not in seen_items:
                            seen_items.add(item_key)
                            items.append(LineItem(
                                name=name,
                                qty=qty,
                                price=price_per_item
                            ))
                            break  # Found match, move to next line
                    except (ValueError, IndexError):
                        continue
        
        return items
    
    def _extract_tax(self, normalized: str) -> Optional[float]:
        """
        Extract tax amount with better separation from other fees
        Avoids false positives from item names containing "tax"
        """
        # More specific patterns to avoid false positives
        # Look for tax on its own line or with clear labels
        patterns = [
            # Tax on its own line: "Tax: ₹50.00" or "GST ₹50.00"
            r'(?:^|\n)\s*(?:tax|gst|vat|cgst|sgst|igst)[:\s]+₹?\s*([\d,]+\.?\d*)',
            # Tax with label: "Tax Amount: ₹50.00"
            r'(?:tax\s+amount|gst\s+amount|vat\s+amount)[:\s]+₹?\s*([\d,]+\.?\d*)',
            # Tax in summary section (after subtotal, before total)
            r'(?:subtotal|items\s+total)[^₹]*tax[:\s]+₹?\s*([\d,]+\.?\d*)',
        ]
        
        candidates = []
        for pattern in patterns:
            matches = re.finditer(pattern, normalized, re.IGNORECASE)
            for match in matches:
                try:
                    # Handle comma-separated amounts
                    amount_str = match.group(1).replace(',', '')
                    amount = float(amount_str)
                    # Tax should be reasonable (not too large relative to typical bills)
                    if 0 < amount <= 5000:
                        candidates.append(amount)
                except (ValueError, IndexError):
                    continue
        
        # Return the first valid tax amount found
        # If multiple found, likely the largest is the total tax
        return max(candidates) if candidates else None
    
    def _extract_delivery_fee(self, normalized: str) -> Optional[float]:
        """
        Extract delivery fee with better pattern matching
        Separates from platform fee and other charges
        """
        # More specific patterns to avoid confusion with platform fees
        patterns = [
            # "Delivery Fee: ₹50" or "Delivery Charges: ₹50"
            r'delivery\s+(?:fee|charges?|charge)[:\s]+₹?\s*([\d,]+\.?\d*)',
            # "Delivery: ₹50" (on its own line)
            r'(?:^|\n)\s*delivery[:\s]+₹?\s*([\d,]+\.?\d*)',
            # "Delivery Fee ₹50" (without colon)
            r'delivery\s+(?:fee|charges?)\s+₹\s*([\d,]+\.?\d*)',
        ]
        
        candidates = []
        for pattern in patterns:
            matches = re.finditer(pattern, normalized, re.IGNORECASE)
            for match in matches:
                try:
                    # Handle comma-separated amounts
                    amount_str = match.group(1).replace(',', '')
                    amount = float(amount_str)
                    # Delivery fee should be reasonable (typically ₹0-500)
                    if 0 <= amount <= 500:
                        candidates.append(amount)
                except (ValueError, IndexError):
                    continue
        
        # Return the first valid delivery fee found
        return candidates[0] if candidates else None
    
    def _extract_platform_fee(self, normalized: str) -> Optional[float]:
        """
        Extract platform/convenience fee with better separation
        Distinguishes from delivery fee and other charges
        """
        # Specific patterns for platform fees (Swiggy/Zomato specific)
        patterns = [
            # "Platform Fee: ₹15" or "Convenience Fee: ₹15"
            r'(?:platform|convenience|service)\s+(?:fee|charges?)[:\s]+₹?\s*([\d,]+\.?\d*)',
            # "Platform Fee ₹15" (without colon)
            r'(?:platform|convenience)\s+(?:fee|charges?)\s+₹\s*([\d,]+\.?\d*)',
            # "Convenience Charge: ₹15"
            r'convenience\s+charge[:\s]+₹?\s*([\d,]+\.?\d*)',
        ]
        
        candidates = []
        for pattern in patterns:
            matches = re.finditer(pattern, normalized, re.IGNORECASE)
            for match in matches:
                try:
                    # Handle comma-separated amounts
                    amount_str = match.group(1).replace(',', '')
                    amount = float(amount_str)
                    # Platform fee should be reasonable (typically ₹0-100)
                    if 0 <= amount <= 100:
                        candidates.append(amount)
                except (ValueError, IndexError):
                    continue
        
        # Return the first valid platform fee found
        return candidates[0] if candidates else None
    
    def _extract_discount(self, normalized: str) -> Optional[float]:
        """
        Extract discount amount with better pattern matching
        Handles negative signs and various discount formats
        """
        # Patterns for discounts (can have negative sign or be labeled as discount)
        patterns = [
            # "Discount: ₹50" or "Discount -₹50"
            r'discount[:\s]+-?₹?\s*([\d,]+\.?\d*)',
            # "Offer: ₹50" or "Promo: ₹50"
            r'(?:offer|promo|promotion|savings|you\s+saved)[:\s]+-?₹?\s*([\d,]+\.?\d*)',
            # "Discount ₹50" (without colon)
            r'discount\s+-?₹\s*([\d,]+\.?\d*)',
            # Negative amount in summary: "-₹50" near discount keywords
            r'(?:discount|offer|promo)[^₹]*-?\s*₹\s*([\d,]+\.?\d*)',
        ]
        
        candidates = []
        for pattern in patterns:
            matches = re.finditer(pattern, normalized, re.IGNORECASE)
            for match in matches:
                try:
                    # Handle comma-separated amounts
                    amount_str = match.group(1).replace(',', '')
                    amount = float(amount_str)
                    # Discount should be reasonable (positive value, typically less than total)
                    if 0 < amount <= 10000:
                        candidates.append(amount)
                except (ValueError, IndexError):
                    continue
        
        # Return the first valid discount found
        return candidates[0] if candidates else None
    
    def suggest_split(
        self,
        total: float,
        items: List[LineItem],
        member_ids: List[str]
    ) -> Optional[Dict]:
        """
        PHASE 4: Suggest auto-split based on total and items
        
        Returns split suggestion with type and amounts
        """
        if not member_ids or len(member_ids) == 0:
            return None
        
        if total <= 0:
            return None
        
        # If we have items, suggest item-based split
        if items and len(items) > 0:
            # For now, suggest equal split per item
            # Later: can enhance to detect item ownership
            amount_per_person = round(total / len(member_ids), 2)
            return {
                "type": "item-based",
                "amount_per_person": amount_per_person,
                "explanation": f"Split {len(items)} items equally among {len(member_ids)} people"
            }
        
        # Default: equal split
        amount_per_person = round(total / len(member_ids), 2)
        
        # Handle rounding: last person gets remainder
        splits = {}
        remaining = total
        for i, member_id in enumerate(member_ids):
            if i == len(member_ids) - 1:
                # Last person gets remainder to ensure exact total
                splits[member_id] = round(remaining, 2)
            else:
                splits[member_id] = amount_per_person
                remaining -= amount_per_person
        
        return {
            "type": "equal",
            "amount_per_person": amount_per_person,
            "splits": splits,
            "explanation": f"Equal split: ₹{amount_per_person} per person"
        }
