#!/usr/bin/env python3
"""
SMS Parser Automation Script
Parses SMS messages to extract bill information automatically
"""

import re
import json
from typing import Dict, Optional, List
from datetime import datetime


class SMSParser:
    """Parse SMS messages to extract bill information"""
    
    # Common Indian payment patterns
    PAYMENT_PATTERNS = {
        'swiggy': [
            r'Swiggy.*?₹(\d+\.?\d*)',
            r'Order.*?₹(\d+\.?\d*)',
        ],
        'zomato': [
            r'Zomato.*?₹(\d+\.?\d*)',
            r'Order.*?₹(\d+\.?\d*)',
        ],
        'phonepe': [
            r'PhonePe.*?₹(\d+\.?\d*)',
            r'Paid.*?₹(\d+\.?\d*)',
        ],
        'gpay': [
            r'Google Pay.*?₹(\d+\.?\d*)',
            r'Payment.*?₹(\d+\.?\d*)',
        ],
        'paytm': [
            r'Paytm.*?₹(\d+\.?\d*)',
            r'Payment.*?₹(\d+\.?\d*)',
        ],
        'blinkit': [
            r'Blinkit.*?₹(\d+\.?\d*)',
            r'Order.*?₹(\d+\.?\d*)',
        ],
        'bigbasket': [
            r'BigBasket.*?₹(\d+\.?\d*)',
            r'Order.*?₹(\d+\.?\d*)',
        ],
    }
    
    def parse_sms(self, sms_text: str, sender: Optional[str] = None) -> Optional[Dict]:
        """
        Parse SMS to extract bill information
        
        Args:
            sms_text: SMS message text
            sender: SMS sender number/name
        
        Returns:
            Extracted bill information or None
        """
        if not sms_text:
            return None
        
        # Normalize text
        text = sms_text.strip()
        
        # Try to identify merchant
        merchant = self._identify_merchant(text, sender)
        
        # Extract amount
        amount = self._extract_amount(text)
        
        # Extract date/time
        date = self._extract_date(text)
        
        # Only return if we found amount
        if amount:
            return {
                "merchant": merchant,
                "amount": amount,
                "date": date,
                "source": "sms",
                "raw_text": text,
                "sender": sender
            }
        
        return None
    
    def _identify_merchant(self, text: str, sender: Optional[str]) -> Optional[str]:
        """Identify merchant from SMS text"""
        text_lower = text.lower()
        
        # Check known patterns
        for merchant, patterns in self.PAYMENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return merchant.title()
        
        # Check sender number (common Indian payment numbers)
        if sender:
            known_senders = {
                'VM-SWIGGY': 'Swiggy',
                'VM-ZOMATO': 'Zomato',
                'VK-PHONEP': 'PhonePe',
                'VK-GPAY': 'Google Pay',
                'VK-PAYTM': 'Paytm',
            }
            if sender in known_senders:
                return known_senders[sender]
        
        return None
    
    def _extract_amount(self, text: str) -> Optional[float]:
        """Extract amount from SMS text"""
        # Pattern: ₹1,234.56 or Rs. 1234 or ₹1234
        patterns = [
            r'₹\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)',
            r'Rs\.?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)',
            r'INR\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)',
            r'Amount[:\s]+₹?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)',
            r'Paid[:\s]+₹?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                amount_str = match.group(1).replace(',', '')
                try:
                    return float(amount_str)
                except ValueError:
                    continue
        
        return None
    
    def _extract_date(self, text: str) -> Optional[str]:
        """Extract date from SMS text"""
        # Common date patterns in Indian SMS
        patterns = [
            r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})',  # DD/MM/YYYY
            r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})',  # DD MMM YYYY
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    if '/' in match.group(0) or '-' in match.group(0):
                        # DD/MM/YYYY format
                        day, month, year = match.groups()
                        if len(year) == 2:
                            year = '20' + year
                        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                    else:
                        # DD MMM YYYY format
                        day, month_name, year = match.groups()
                        month_map = {
                            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                            'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                            'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
                        }
                        month = month_map.get(month_name.lower(), '01')
                        if len(year) == 2:
                            year = '20' + year
                        return f"{year}-{month}-{day.zfill(2)}"
                except Exception:
                    continue
        
        # Return current date if no date found
        return datetime.now().strftime('%Y-%m-%d')
    
    def batch_parse(self, sms_list: List[Dict]) -> List[Dict]:
        """
        Parse multiple SMS messages
        
        Args:
            sms_list: List of SMS dicts with 'text' and optionally 'sender'
        
        Returns:
            List of extracted bill information
        """
        results = []
        for sms in sms_list:
            parsed = self.parse_sms(
                sms.get('text', ''),
                sms.get('sender')
            )
            if parsed:
                results.append(parsed)
        
        return results


if __name__ == "__main__":
    # Example usage
    parser = SMSParser()
    
    test_sms = [
        {
            "text": "Swiggy Order #SW123456\nAmount: ₹450.00\nDate: 15/12/2024\nThank you!",
            "sender": "VM-SWIGGY"
        },
        {
            "text": "PhonePe Payment Successful\nPaid ₹1,200.00 to Blinkit\nDate: 15-12-2024",
            "sender": "VK-PHONEP"
        }
    ]
    
    results = parser.batch_parse(test_sms)
    print(json.dumps(results, indent=2))
