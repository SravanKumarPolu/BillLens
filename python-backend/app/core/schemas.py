"""
Pydantic schemas for request/response models
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Literal, Any


# OCR Schemas
class OCRRequest(BaseModel):
    """Request for OCR parsing"""
    image_base64: str  # Base64 encoded image from React Native
    currency: str = "INR"
    hint: Optional[str] = None  # "swiggy", "zomato", etc


class LineItem(BaseModel):
    """Line item from receipt"""
    name: str
    qty: float = 1.0
    price: float


class OCRResponse(BaseModel):
    """Structured OCR response (PHASE 2)"""
    merchant: str
    currency: str = "INR"
    subtotal: Optional[float] = None  # Before tax/fees (items sum or calculated)
    tax: Optional[float] = None
    total: float
    items: List[LineItem]
    date: Optional[str] = None
    time: Optional[str] = None
    delivery_fee: Optional[float] = None
    platform_fee: Optional[float] = None
    discount: Optional[float] = None
    confidence: float = 0.0
    raw_text: Optional[str] = None


class RawOCRResponse(BaseModel):
    """Raw OCR text response (PHASE 1)"""
    raw_text: str
    engine: str
    confidence: float = 0.0


class SplitSuggestion(BaseModel):
    """Auto-split suggestion"""
    type: Literal["equal", "item-based", "custom"]
    amount_per_person: Optional[float] = None
    splits: Optional[Dict[str, float]] = None  # memberId -> amount
    explanation: str


class ParsedReceiptResponse(BaseModel):
    """Complete parsed receipt with split suggestions"""
    merchant: str
    currency: str = "INR"
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total: float
    items: List[LineItem]
    date: Optional[str] = None
    time: Optional[str] = None
    delivery_fee: Optional[float] = None
    platform_fee: Optional[float] = None
    discount: Optional[float] = None
    confidence: float = 0.0
    raw_text: Optional[str] = None
    suggested_split: Optional[SplitSuggestion] = None


# Settlement Schemas
class Member(BaseModel):
    """Group member"""
    id: str
    name: str


class Expense(BaseModel):
    """Expense with splits"""
    id: str
    paid_by: str
    splits: Dict[str, float]  # memberId -> amount owed
    amount: float


class Settlement(BaseModel):
    """Settlement transaction"""
    id: str
    from_id: str
    to_id: str
    amount: float


class ValidateRequest(BaseModel):
    """Request for settlement validation"""
    members: List[Member]
    expenses: List[Expense]
    settlements: List[Settlement]


class ValidateResponse(BaseModel):
    """Response from settlement validation"""
    balances: Dict[str, float]  # memberId -> net balance (+ = gets money, - = owes)
    audit: List[str]  # human-readable explanations
    status: Literal["ok", "warn", "error"]


# Sync Schemas
class PushRequest(BaseModel):
    """Request to push data to server"""
    user_id: str
    payload: Dict[str, Any]  # groups, expenses, etc


class PushResponse(BaseModel):
    """Response from push"""
    ok: bool
    message: str
    user_id: str


class PullResponse(BaseModel):
    """Response from pull"""
    ok: bool
    user_id: str
    payload: Dict[str, Any]
