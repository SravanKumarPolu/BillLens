"""
BillLens Backend API
FastAPI application for OCR, settlement validation, and sync
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ocr, settlement, sync

app = FastAPI(
    title="BillLens API",
    description="Backend API for BillLens - OCR, settlement validation, and sync",
    version="0.1.0"
)

# CORS middleware for React Native app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ocr.router, prefix="/ocr", tags=["ocr"])
app.include_router(settlement.router, prefix="/settlement", tags=["settlement"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "BillLens API",
        "version": "0.1.0",
        "status": "ok"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
