#!/usr/bin/env python3
"""
Validate Bills Script
Validates settlement logic from exported JSON

Usage:
    python validate_bills.py export.json
"""

import json
import sys
from typing import Dict, List


def compute_balances(data: Dict) -> Dict[str, float]:
    """
    Compute balances from expenses and settlements
    
    Returns:
        Dict mapping member_id to net balance
    """
    members = data.get("members", [])
    expenses = data.get("expenses", [])
    settlements = data.get("settlements", [])
    
    # Initialize balances
    balances = {m["id"]: 0.0 for m in members}
    
    # Process expenses
    for e in expenses:
        paid_by = e.get("paid_by") or e.get("paidBy")
        amount = float(e.get("amount", 0))
        
        if paid_by in balances:
            balances[paid_by] += amount
        
        # Process splits
        splits = e.get("splits", [])
        for split in splits:
            member_id = split.get("memberId") or split.get("member_id")
            owed = float(split.get("amount", 0))
            
            if member_id in balances:
                balances[member_id] -= owed
    
    # Apply settlements
    for s in settlements:
        from_id = s.get("fromMemberId") or s.get("from_id")
        to_id = s.get("toMemberId") or s.get("to_id")
        amount = float(s.get("amount", 0))
        
        if from_id in balances and to_id in balances:
            balances[from_id] += amount
            balances[to_id] -= amount
    
    return balances


def main(path: str):
    """Main validation function"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File not found: {path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON: {e}")
        sys.exit(1)
    
    # Compute balances
    balances = compute_balances(data)
    total = sum(balances.values())
    
    # Print results
    print("\n" + "=" * 60)
    print("BillLens Settlement Validation")
    print("=" * 60)
    
    print("\nBalances (+ gets money, - owes money):")
    print("-" * 60)
    
    # Sort by balance
    sorted_balances = sorted(balances.items(), key=lambda x: x[1], reverse=True)
    
    for member_id, balance in sorted_balances:
        if abs(balance) > 0.01:  # Only show non-zero balances
            status = "gets" if balance > 0 else "owes"
            print(f"  {member_id:20s} {status:4s} ₹{abs(balance):10.2f}")
        else:
            print(f"  {member_id:20s} {'OK':4s} ₹{balance:10.2f}")
    
    print("-" * 60)
    print(f"\nInvariant Check: Total net sum = ₹{total:.6f} (should be near 0)")
    
    # Validation result
    if abs(total) < 0.01:
        print("✅ OK: Balances sum to zero (within tolerance)")
        sys.exit(0)
    elif abs(total) < 1.0:
        print("⚠️  WARN: Small rounding error detected (may be acceptable)")
        sys.exit(0)
    else:
        print("❌ ERROR: Totals don't cancel out. Possible split/settlement bug!")
        print("\nPossible causes:")
        print("  - Splits don't sum to expense amounts")
        print("  - Settlement amounts don't match balances")
        print("  - Data corruption or missing expenses")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_bills.py <export.json>")
        print("\nExample:")
        print("  python validate_bills.py billlens-export.json")
        sys.exit(1)
    
    main(sys.argv[1])
