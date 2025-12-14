"""
Analytics Router
Handles expense analytics and fairness scoring endpoints
"""

from fastapi import APIRouter, HTTPException
import sys
from pathlib import Path

# Add services directory to path
backend_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_root))

from app.core.schemas import (
    AnalyticsRequest, AnalyticsResponse,
    FairnessRequest, FairnessResponse,
    ReliabilityRequest, ReliabilityResponse
)
from services.analytics_service import ExpenseAnalytics
from services.fairness_service import FairnessScoring

router = APIRouter()


@router.post("/expense", response_model=AnalyticsResponse)
def get_expense_analytics(request: AnalyticsRequest):
    """
    Get expense analytics for a group
    
    Returns monthly totals, category breakdown, current month total, and spending trends.
    """
    try:
        # Convert expenses to dict format for service
        expenses = [expense.dict(exclude_none=True) for expense in request.expenses]
        
        # Validate we have expenses
        if not expenses:
            return AnalyticsResponse(
                monthly_totals=[],
                category_breakdown=[],
                current_month_total={"total": 0.0, "count": 0, "month": "", "year": 0},
                spending_trends=None
            )
        
        # Calculate monthly totals
        monthly_totals_data = ExpenseAnalytics.calculate_monthly_totals(
            expenses, 
            months=request.months
        )
        
        # Calculate category breakdown
        category_breakdown_data = ExpenseAnalytics.calculate_category_breakdown(
            expenses,
            start_date=request.start_date,
            end_date=request.end_date
        )
        
        # Calculate current month total
        current_month_data = ExpenseAnalytics.calculate_current_month_total(expenses)
        
        # Calculate spending trends (optional, for all expenses)
        spending_trends_data = None
        if expenses:
            spending_trends_data = ExpenseAnalytics.calculate_spending_trends(expenses)
        
        return AnalyticsResponse(
            monthly_totals=monthly_totals_data,
            category_breakdown=category_breakdown_data,
            current_month_total=current_month_data,
            spending_trends=spending_trends_data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid request data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating analytics: {str(e)}")


@router.post("/fairness", response_model=FairnessResponse)
def get_fairness_score(request: FairnessRequest):
    """
    Calculate fairness score for a group
    
    Returns fairness score based on payment distribution, split equality, and balance distribution.
    """
    try:
        # Validate input
        if not request.members:
            raise ValueError("At least one member is required")
        
        # Convert to dict format
        expenses = [expense.dict(exclude_none=True) for expense in request.expenses]
        members = [member.dict(exclude_none=True) for member in request.members]
        balances = [balance.dict(exclude_none=True) for balance in request.balances]
        
        # Calculate fairness score
        result = FairnessScoring.calculate_fairness_score(expenses, members, balances)
        
        return FairnessResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid request data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating fairness score: {str(e)}")


@router.post("/reliability", response_model=ReliabilityResponse)
def get_reliability_meter(request: ReliabilityRequest):
    """
    Calculate reliability meter for data quality
    
    Returns reliability score based on data completeness, split accuracy, and settlement completeness.
    """
    try:
        # Convert to dict format
        expenses = [expense.dict(exclude_none=True) for expense in request.expenses]
        settlements = [settlement.dict(exclude_none=True) for settlement in request.settlements]
        
        # Calculate reliability meter
        result = FairnessScoring.calculate_reliability_meter(expenses, settlements)
        
        return ReliabilityResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid request data: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating reliability meter: {str(e)}")


@router.get("/health")
def health_check():
    """Health check for analytics service"""
    return {"status": "ok", "service": "analytics"}
