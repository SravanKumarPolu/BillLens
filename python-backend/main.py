"""
Legacy main.py - Redirects to new app structure
For backward compatibility, use: python -m app.main
"""

# Redirect to new app structure
if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.getenv("PORT", 8000))
    print("⚠️  Using legacy main.py - consider using: python -m app.main")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
