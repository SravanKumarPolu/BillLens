"""
Settlement Router
Handles settlement validation and balance calculation
"""

from fastapi import APIRouter
from app.core.schemas import ValidateRequest, ValidateResponse, Member, Expense, Settlement

router = APIRouter()


@router.post("/validate", response_model=ValidateResponse)
def validate(data: ValidateRequest):
    """
    Validate settlement logic and compute balances
    
    Computes net balances from expenses and settlements,
    verifies mathematical correctness, and provides audit trail.
    """
    # Initialize balances for all members
    balances = {m.id: 0.0 for m in data.members}
    audit = []
    
    # Process expenses
    for e in data.expenses:
        # Payer gets credited the full amount
        balances[e.paid_by] += float(e.amount)
        audit.append(f"Expense {e.id}: {e.paid_by} paid ₹{e.amount:.2f}")
        
        # Each member owes their split
        split_total = 0.0
        for member_id, owed in e.splits.items():
            if member_id in balances:
                balances[member_id] -= float(owed)
                split_total += float(owed)
                audit.append(f"  → {member_id} owes ₹{owed:.2f}")
        
        # Verify splits sum to expense amount
        diff = abs(split_total - float(e.amount))
        if diff > 0.01:
            audit.append(f"  ⚠️ WARNING: Splits sum to ₹{split_total:.2f}, but expense is ₹{e.amount:.2f} (diff: ₹{diff:.2f})")
    
    # Apply settlements (money moved)
    for s in data.settlements:
        if s.from_id in balances and s.to_id in balances:
            balances[s.from_id] += float(s.amount)  # Payer owes less -> moves toward 0
            balances[s.to_id] -= float(s.amount)     # Receiver gets less outstanding
            audit.append(f"Settlement {s.id}: {s.from_id} → {s.to_id}: ₹{s.amount:.2f}")
        else:
            audit.append(f"⚠️ WARNING: Settlement {s.id} references unknown member")
    
    # Verify invariant: sum of balances should be ~0
    total = sum(balances.values())
    audit.append(f"\nBalance Summary:")
    for member_id, balance in sorted(balances.items(), key=lambda x: x[1], reverse=True):
        if abs(balance) > 0.01:
            status = "gets" if balance > 0 else "owes"
            audit.append(f"  {member_id}: {status} ₹{abs(balance):.2f}")
    
    audit.append(f"\nInvariant Check: Total net sum = ₹{total:.6f} (should be near 0)")
    
    # Determine status
    if abs(total) < 0.01:
        status = "ok"
    elif abs(total) < 1.0:
        status = "warn"
        audit.append("⚠️ WARNING: Small rounding error detected")
    else:
        status = "error"
        audit.append("❌ ERROR: Balances don't sum to zero! Possible data corruption.")
    
    return ValidateResponse(
        balances=balances,
        audit=audit,
        status=status
    )
