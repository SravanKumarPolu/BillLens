"""
Analytics Service
Provides expense analytics and insights
"""

from typing import List, Dict, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import math


class ExpenseAnalytics:
    """Expense analytics calculations"""
    
    @staticmethod
    def calculate_monthly_totals(expenses: List[Dict], months: int = 6) -> List[Dict]:
        """
        Calculate monthly totals for the last N months
        
        Args:
            expenses: List of expense dictionaries with 'date' and 'amount'
            months: Number of months to analyze (default: 6)
            
        Returns:
            List of monthly totals with month, year, amount, count
        """
        now = datetime.now()
        monthly_data = defaultdict(lambda: {"amount": 0.0, "count": 0})
        
        # Process expenses
        for expense in expenses:
            try:
                date_str = expense.get("date", "")
                if not date_str:
                    continue
                
                # Handle different ISO date formats
                if date_str.endswith("Z"):
                    date_str = date_str.replace("Z", "+00:00")
                elif "+" not in date_str and "-" in date_str:
                    # Assume UTC if no timezone
                    date_str = date_str + "+00:00"
                
                expense_date = datetime.fromisoformat(date_str)
                # Check if within the last N months
                months_ago = now - timedelta(days=months * 30)
                if expense_date >= months_ago:
                    month_key = f"{expense_date.year}-{expense_date.month:02d}"
                    monthly_data[month_key]["amount"] += float(expense.get("amount", 0))
                    monthly_data[month_key]["count"] += 1
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
        
        # Format results
        results = []
        for i in range(months - 1, -1, -1):
            date = now - timedelta(days=i * 30)
            month_key = f"{date.year}-{date.month:02d}"
            
            results.append({
                "month": date.strftime("%b"),
                "year": date.year,
                "amount": monthly_data[month_key]["amount"],
                "count": monthly_data[month_key]["count"]
            })
        
        return results
    
    @staticmethod
    def calculate_category_breakdown(expenses: List[Dict], start_date: Optional[str] = None, 
                                     end_date: Optional[str] = None) -> List[Dict]:
        """
        Calculate category breakdown
        
        Args:
            expenses: List of expense dictionaries
            start_date: Optional start date filter (ISO format)
            end_date: Optional end date filter (ISO format)
            
        Returns:
            List of category totals with category, amount, count
        """
        category_map = defaultdict(lambda: {"amount": 0.0, "count": 0})
        
        # Parse date filters
        start = None
        end = None
        if start_date:
            try:
                start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except ValueError:
                pass
        if end_date:
            try:
                end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except ValueError:
                pass
        
        # Process expenses
        for expense in expenses:
            try:
                date_str = expense.get("date", "")
                if not date_str:
                    continue
                
                # Handle different ISO date formats
                if date_str.endswith("Z"):
                    date_str = date_str.replace("Z", "+00:00")
                elif "+" not in date_str and "-" in date_str:
                    # Assume UTC if no timezone
                    date_str = date_str + "+00:00"
                
                expense_date = datetime.fromisoformat(date_str)
                
                # Apply date filters
                if start and expense_date < start:
                    continue
                if end and expense_date > end:
                    continue
                
                category = expense.get("category") or "Other"
                amount = float(expense.get("amount", 0))
                
                if amount > 0:  # Only count positive amounts
                    category_map[category]["amount"] += amount
                    category_map[category]["count"] += 1
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
        
        # Format results
        results = [
            {
                "category": category,
                "amount": data["amount"],
                "count": data["count"]
            }
            for category, data in category_map.items()
        ]
        
        # Sort by amount descending
        results.sort(key=lambda x: x["amount"], reverse=True)
        
        return results
    
    @staticmethod
    def calculate_spending_trends(expenses: List[Dict], member_id: Optional[str] = None) -> Dict:
        """
        Calculate spending trends
        
        Args:
            expenses: List of expense dictionaries
            member_id: Optional member ID to filter expenses
            
        Returns:
            Dictionary with trend analysis
        """
        # Filter by member if provided
        filtered_expenses = expenses
        if member_id:
            filtered_expenses = [e for e in expenses if e.get("paidBy") == member_id]
        
        if not filtered_expenses:
            return {
                "average_per_month": 0.0,
                "trend_percentage": 0.0,
                "pattern": "sporadic",
                "total_expenses": 0,
                "monthly_breakdown": {}
            }
        
        # Calculate monthly totals
        monthly_totals = defaultdict(float)
        for expense in filtered_expenses:
            try:
                date_str = expense.get("date", "")
                if not date_str:
                    continue
                
                # Handle different ISO date formats
                if date_str.endswith("Z"):
                    date_str = date_str.replace("Z", "+00:00")
                elif "+" not in date_str and "-" in date_str:
                    # Assume UTC if no timezone
                    date_str = date_str + "+00:00"
                
                expense_date = datetime.fromisoformat(date_str)
                month_key = f"{expense_date.year}-{expense_date.month:02d}"
                monthly_totals[month_key] += float(expense.get("amount", 0))
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
        
        if not monthly_totals:
            return {
                "average_per_month": 0.0,
                "trend_percentage": 0.0,
                "pattern": "sporadic",
                "total_expenses": len(filtered_expenses),
                "monthly_breakdown": {}
            }
        
        # Calculate average
        monthly_values = list(monthly_totals.values())
        average_per_month = sum(monthly_values) / len(monthly_values) if monthly_values else 0.0
        
        # Calculate trend (last 2 months vs previous 2 months)
        sorted_months = sorted(monthly_totals.items())
        trend_percentage = 0.0
        
        if len(sorted_months) >= 4:
            recent_total = sum([val for _, val in sorted_months[-2:]])
            previous_total = sum([val for _, val in sorted_months[-4:-2]])
            
            if previous_total > 0:
                trend_percentage = ((recent_total - previous_total) / previous_total) * 100
        
        # Determine pattern
        pattern = "consistent"
        if len(monthly_values) >= 3:
            # Calculate variance
            variance = sum((val - average_per_month) ** 2 for val in monthly_values) / len(monthly_values)
            std_dev = math.sqrt(variance)
            coefficient = (std_dev / average_per_month) if average_per_month > 0 else 0
            
            if coefficient > 0.5:
                pattern = "sporadic"
            elif trend_percentage > 20:
                pattern = "increasing"
            elif trend_percentage < -20:
                pattern = "decreasing"
        else:
            pattern = "sporadic"
        
        return {
            "average_per_month": round(average_per_month, 2),
            "trend_percentage": round(trend_percentage, 2),
            "pattern": pattern,
            "total_expenses": len(filtered_expenses),
            "monthly_breakdown": dict(monthly_totals)
        }
    
    @staticmethod
    def calculate_current_month_total(expenses: List[Dict]) -> Dict:
        """
        Calculate current month total
        
        Args:
            expenses: List of expense dictionaries
            
        Returns:
            Dictionary with current month total and count
        """
        now = datetime.now()
        current_month = now.month
        current_year = now.year
        
        current_month_expenses = []
        for expense in expenses:
            try:
                date_str = expense.get("date", "")
                if not date_str:
                    continue
                
                # Handle different ISO date formats
                if date_str.endswith("Z"):
                    date_str = date_str.replace("Z", "+00:00")
                elif "+" not in date_str and "-" in date_str:
                    # Assume UTC if no timezone
                    date_str = date_str + "+00:00"
                
                expense_date = datetime.fromisoformat(date_str)
                if expense_date.month == current_month and expense_date.year == current_year:
                    current_month_expenses.append(expense)
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
        
        total = sum(float(e.get("amount", 0)) for e in current_month_expenses)
        
        return {
            "total": round(total, 2),
            "count": len(current_month_expenses),
            "month": now.strftime("%b"),
            "year": current_year
        }
