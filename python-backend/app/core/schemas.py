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


# Analytics Schemas
class ExpenseData(BaseModel):
    """Expense data for analytics"""
    id: str
    date: str
    amount: float
    category: Optional[str] = None
    paidBy: str
    splits: List[Dict[str, Any]] = []  # Array of split objects with memberId and amount
    merchant: Optional[str] = None
    title: Optional[str] = None
    
    class Config:
        # Allow extra fields for backward compatibility
        extra = "allow"


class GroupMember(BaseModel):
    """Group member for analytics"""
    id: str
    name: str


class BalanceData(BaseModel):
    """Balance data for fairness scoring"""
    memberId: str
    balance: float


class SettlementData(BaseModel):
    """Settlement data for reliability"""
    id: str
    status: str


class AnalyticsRequest(BaseModel):
    """Request for expense analytics"""
    expenses: List[ExpenseData]
    group_id: Optional[str] = None
    start_date: Optional[str] = None  # ISO format
    end_date: Optional[str] = None  # ISO format
    months: int = 6  # Number of months for trend analysis


class MonthlyTotal(BaseModel):
    """Monthly total data"""
    month: str
    year: int
    amount: float
    count: int


class CategoryBreakdown(BaseModel):
    """Category breakdown data"""
    category: str
    amount: float
    count: int


class SpendingTrend(BaseModel):
    """Spending trend data"""
    average_per_month: float
    trend_percentage: float
    pattern: Literal["consistent", "sporadic", "increasing", "decreasing"]
    total_expenses: int
    monthly_breakdown: Dict[str, float]


class CurrentMonthTotal(BaseModel):
    """Current month total"""
    total: float
    count: int
    month: str
    year: int


class AnalyticsResponse(BaseModel):
    """Response from expense analytics"""
    monthly_totals: List[MonthlyTotal]
    category_breakdown: List[CategoryBreakdown]
    current_month_total: CurrentMonthTotal
    spending_trends: Optional[SpendingTrend] = None


class FairnessRequest(BaseModel):
    """Request for fairness scoring"""
    expenses: List[ExpenseData]
    members: List[GroupMember]
    balances: List[BalanceData]


class FairnessFactors(BaseModel):
    """Fairness score factors"""
    paymentDistribution: int
    splitEquality: int
    balanceDistribution: int


class FairnessResponse(BaseModel):
    """Response from fairness scoring"""
    score: int  # 0-100
    level: Literal["excellent", "good", "fair", "poor", "unfair"]
    factors: FairnessFactors
    issues: List[str]
    recommendations: List[str]


class ReliabilityRequest(BaseModel):
    """Request for reliability meter"""
    expenses: List[ExpenseData]
    settlements: List[SettlementData]


class ReliabilityFactors(BaseModel):
    """Reliability score factors"""
    dataCompleteness: int
    splitAccuracy: int
    settlementCompleteness: int


class ReliabilityResponse(BaseModel):
    """Response from reliability meter"""
    score: int  # 0-100
    level: Literal["high", "medium", "low"]
    factors: ReliabilityFactors
    warnings: List[str]
