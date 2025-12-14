"""
Fairness Scoring Service
Calculates fairness scores and reliability metrics
"""

from typing import List, Dict, Optional
from collections import defaultdict
import math


class FairnessScoring:
    """Fairness scoring calculations"""
    
    @staticmethod
    def calculate_fairness_score(
        expenses: List[Dict],
        members: List[Dict],
        balances: List[Dict]
    ) -> Dict:
        """
        Calculate fairness score for a group
        
        Args:
            expenses: List of expense dictionaries
            members: List of member dictionaries with 'id' and 'name'
            balances: List of balance dictionaries with 'memberId' and 'balance'
            
        Returns:
            Dictionary with fairness score, level, factors, issues, recommendations
        """
        if not expenses:
            return {
                "score": 100,
                "level": "excellent",
                "factors": {
                    "paymentDistribution": 100,
                    "splitEquality": 100,
                    "balanceDistribution": 100
                },
                "issues": [],
                "recommendations": ["Add expenses to calculate fairness score"]
            }
        
        member_count = len(members)
        total_expenses = sum(float(e.get("amount", 0)) for e in expenses)
        expected_share = total_expenses / member_count if member_count > 0 else 0
        
        # Factor 1: Payment Distribution (how evenly people pay)
        payment_totals = defaultdict(float)
        for expense in expenses:
            paid_by = expense.get("paidBy")
            if paid_by:
                payment_totals[paid_by] += float(expense.get("amount", 0))
        
        payment_deviations = []
        for member in members:
            paid = payment_totals.get(member.get("id"), 0.0)
            if expected_share > 0:
                deviation = abs(paid - expected_share) / expected_share
            else:
                deviation = 0.0
            payment_deviations.append(deviation)
        
        avg_deviation = sum(payment_deviations) / len(payment_deviations) if payment_deviations else 0
        payment_distribution_score = max(0, 100 - (avg_deviation * 100))
        
        # Factor 2: Split Equality (how equal splits are)
        split_inequalities = []
        
        for expense in expenses:
            splits = expense.get("splits", [])
            if not splits or len(splits) < 2:
                continue
            
            # Handle both array format and dict format
            split_amounts = []
            try:
                if isinstance(splits, list):
                    for s in splits:
                        if isinstance(s, dict):
                            amount = s.get("amount", 0)
                            if amount is not None:
                                split_amounts.append(float(amount))
                        elif isinstance(s, (int, float)):
                            split_amounts.append(float(s))
                elif isinstance(splits, dict):
                    split_amounts = [float(v) for v in splits.values() if v is not None]
            except (ValueError, TypeError, AttributeError):
                continue
            
            if not split_amounts or len(split_amounts) < 2:
                continue
            
            avg_split = sum(split_amounts) / len(split_amounts)
            if avg_split > 0:
                max_deviation = max(abs(amount - avg_split) for amount in split_amounts)
                deviation_ratio = max_deviation / avg_split
                
                if deviation_ratio > 0.1:  # More than 10% deviation
                    split_inequalities.append(deviation_ratio)
        
        split_equality_score = 100
        if split_inequalities:
            avg_inequality = sum(split_inequalities) / len(split_inequalities)
            split_equality_score = max(0, 100 - (avg_inequality * 200))
        
        # Factor 3: Balance Distribution (how balanced final balances are)
        balance_deviations = []
        for balance in balances:
            balance_amount = abs(float(balance.get("balance", 0)))
            if expected_share > 0:
                deviation = balance_amount / expected_share
            else:
                deviation = 0.0
            balance_deviations.append(deviation)
        
        avg_balance_deviation = sum(balance_deviations) / len(balance_deviations) if balance_deviations else 0
        balance_distribution_score = max(0, 100 - (avg_balance_deviation * 50))
        
        # Calculate overall score (weighted average)
        overall_score = round(
            (payment_distribution_score * 0.4) +
            (split_equality_score * 0.3) +
            (balance_distribution_score * 0.3)
        )
        
        # Determine level
        if overall_score < 50:
            level = "unfair"
        elif overall_score < 70:
            level = "poor"
        elif overall_score < 85:
            level = "fair"
        elif overall_score < 95:
            level = "good"
        else:
            level = "excellent"
        
        # Identify issues
        issues = []
        if payment_distribution_score < 70:
            issues.append("Uneven payment distribution - some people pay more than others")
        if split_equality_score < 70:
            issues.append("Many unequal splits - consider using equal splits more often")
        if balance_distribution_score < 70:
            issues.append("Unbalanced final balances - consider settling up")
        
        # Generate recommendations
        recommendations = []
        if payment_distribution_score < 80:
            recommendations.append("Try to distribute expenses more evenly among group members")
        if split_equality_score < 80:
            recommendations.append("Use equal splits when possible for fairness")
        if balance_distribution_score < 80:
            recommendations.append("Settle outstanding balances to maintain fairness")
        if not issues:
            recommendations.append("Great job! Your group maintains fair expense splitting")
        
        return {
            "score": overall_score,
            "level": level,
            "factors": {
                "paymentDistribution": round(payment_distribution_score),
                "splitEquality": round(split_equality_score),
                "balanceDistribution": round(balance_distribution_score)
            },
            "issues": issues,
            "recommendations": recommendations
        }
    
    @staticmethod
    def calculate_reliability_meter(
        expenses: List[Dict],
        settlements: List[Dict]
    ) -> Dict:
        """
        Calculate reliability meter for data quality
        
        Args:
            expenses: List of expense dictionaries
            settlements: List of settlement dictionaries
            
        Returns:
            Dictionary with reliability score, level, factors, warnings
        """
        if not expenses:
            return {
                "score": 0,
                "level": "low",
                "factors": {
                    "dataCompleteness": 0,
                    "splitAccuracy": 0,
                    "settlementCompleteness": 0
                },
                "warnings": ["No expenses recorded yet"]
            }
        
        # Factor 1: Data Completeness
        complete_expenses = 0
        for expense in expenses:
            try:
                has_merchant = bool(expense.get("merchant") or expense.get("title"))
                has_amount = float(expense.get("amount", 0)) > 0
                has_splits = bool(expense.get("splits"))
                
                if has_merchant and has_amount and has_splits:
                    complete_expenses += 1
            except (ValueError, TypeError):
                continue
        
        data_completeness = (complete_expenses / len(expenses)) * 100 if expenses else 0
        
        # Factor 2: Split Accuracy (splits sum to total)
        accurate_splits = 0
        for expense in expenses:
            splits = expense.get("splits", [])
            if not splits:
                continue
            
            try:
                # Handle both array format and dict format
                split_total = 0.0
                if isinstance(splits, list):
                    for s in splits:
                        if isinstance(s, dict):
                            amount = s.get("amount", 0)
                            if amount is not None:
                                split_total += float(amount)
                        elif isinstance(s, (int, float)):
                            split_total += float(s)
                elif isinstance(splits, dict):
                    split_total = sum(float(v) for v in splits.values() if v is not None)
                
                expense_amount = float(expense.get("amount", 0))
                if abs(split_total - expense_amount) < 0.01:
                    accurate_splits += 1
            except (ValueError, TypeError, AttributeError):
                continue
        
        split_accuracy = (accurate_splits / len(expenses)) * 100 if expenses else 100
        
        # Factor 3: Settlement Completeness
        completed_settlements = sum(1 for s in settlements if s.get("status") == "completed")
        settlement_completeness = (completed_settlements / len(settlements)) * 100 if settlements else 100
        
        # Calculate overall score
        overall_score = round(
            (data_completeness * 0.4) +
            (split_accuracy * 0.4) +
            (settlement_completeness * 0.2)
        )
        
        # Determine level
        if overall_score < 70:
            level = "low"
        elif overall_score < 85:
            level = "medium"
        else:
            level = "high"
        
        # Generate warnings
        warnings = []
        if data_completeness < 90:
            warnings.append("Some expenses are missing merchant names or splits")
        if split_accuracy < 95:
            warnings.append("Some expense splits do not match the total amount")
        if settlement_completeness < 100 and settlements:
            warnings.append("Some settlements are marked as pending")
        if not warnings:
            warnings.append("All data looks accurate and complete")
        
        return {
            "score": overall_score,
            "level": level,
            "factors": {
                "dataCompleteness": round(data_completeness),
                "splitAccuracy": round(split_accuracy),
                "settlementCompleteness": round(settlement_completeness)
            },
            "warnings": warnings
        }
