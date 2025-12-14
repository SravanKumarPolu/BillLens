#!/usr/bin/env python3
"""
Export CSV Script
Exports BillLens data to CSV format

Usage:
    python export_csv.py export.json
"""

import json
import csv
import sys
from typing import Dict, List


def export_expenses(data: Dict, output_file: str = "expenses.csv"):
    """Export expenses to CSV"""
    expenses = data.get("expenses", [])
    
    if not expenses:
        print("⚠️  No expenses found in data")
        return
    
    with open(output_file, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        
        # Header
        writer.writerow(["id", "paid_by", "amount", "date", "merchant", "category", "note"])
        
        # Rows
        for e in expenses:
            writer.writerow([
                e.get("id", ""),
                e.get("paid_by") or e.get("paidBy", ""),
                e.get("amount", 0),
                e.get("date", ""),
                e.get("merchant") or e.get("title", ""),
                e.get("category", ""),
                e.get("note", "") or e.get("description", ""),
            ])
    
    print(f"✅ Exported {len(expenses)} expenses to {output_file}")


def export_settlements(data: Dict, output_file: str = "settlements.csv"):
    """Export settlements to CSV"""
    settlements = data.get("settlements", [])
    
    if not settlements:
        print("⚠️  No settlements found in data")
        return
    
    with open(output_file, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        
        # Header
        writer.writerow(["id", "from_id", "to_id", "amount", "date", "status"])
        
        # Rows
        for s in settlements:
            writer.writerow([
                s.get("id", ""),
                s.get("fromMemberId") or s.get("from_id", ""),
                s.get("toMemberId") or s.get("to_id", ""),
                s.get("amount", 0),
                s.get("date", ""),
                s.get("status", "completed"),
            ])
    
    print(f"✅ Exported {len(settlements)} settlements to {output_file}")


def export_balances(data: Dict, output_file: str = "balances.csv"):
    """Export current balances to CSV"""
    # Compute balances
    from validate_bills import compute_balances
    
    balances = compute_balances(data)
    
    with open(output_file, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        
        # Header
        writer.writerow(["member_id", "balance"])
        
        # Rows (sorted by balance)
        sorted_balances = sorted(balances.items(), key=lambda x: x[1], reverse=True)
        for member_id, balance in sorted_balances:
            writer.writerow([member_id, balance])
    
    print(f"✅ Exported balances to {output_file}")


def main(path: str):
    """Main export function"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File not found: {path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON: {e}")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("BillLens CSV Export")
    print("=" * 60)
    print()
    
    # Export all data types
    export_expenses(data)
    export_settlements(data)
    export_balances(data)
    
    print("\n✅ Export complete!")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python export_csv.py <export.json>")
        print("\nExample:")
        print("  python export_csv.py billlens-export.json")
        print("\nOutput files:")
        print("  - expenses.csv")
        print("  - settlements.csv")
        print("  - balances.csv")
        sys.exit(1)
    
    main(sys.argv[1])
