"""
Sync Router
Handles cloud sync (push/pull) for groups, expenses, settlements
"""

from fastapi import APIRouter, HTTPException
from app.core.schemas import PushRequest, PushResponse, PullResponse
from typing import Dict, Any

router = APIRouter()

# In-memory storage (replace with database in production)
_storage: Dict[str, Dict[str, Any]] = {}


@router.post("/push", response_model=PushResponse)
def push(req: PushRequest):
    """
    Push user data to server
    
    TODO: Replace in-memory storage with database (Postgres/Supabase)
    """
    try:
        # Store payload
        _storage[req.user_id] = {
            "payload": req.payload,
            "updated_at": "2024-01-01T00:00:00Z"  # TODO: Use actual timestamp
        }
        
        return PushResponse(
            ok=True,
            message="Data saved successfully (placeholder - using in-memory storage)",
            user_id=req.user_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Push failed: {str(e)}")


@router.get("/pull", response_model=PullResponse)
def pull(user_id: str):
    """
    Pull latest data from server
    
    TODO: Replace in-memory storage with database (Postgres/Supabase)
    """
    try:
        if user_id in _storage:
            return PullResponse(
                ok=True,
                user_id=user_id,
                payload=_storage[user_id]["payload"]
            )
        else:
            # Return empty payload if user not found
            return PullResponse(
                ok=True,
                user_id=user_id,
                payload={}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pull failed: {str(e)}")
