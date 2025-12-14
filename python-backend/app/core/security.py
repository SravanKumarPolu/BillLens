"""
Security utilities (API keys, authentication, etc.)
For now, basic structure - can be enhanced later
"""

from typing import Optional
import os


def get_api_key() -> Optional[str]:
    """Get API key from environment"""
    return os.getenv("API_KEY")


def verify_api_key(provided_key: Optional[str]) -> bool:
    """Verify API key (basic implementation)"""
    expected_key = get_api_key()
    if not expected_key:
        return True  # No key required
    return provided_key == expected_key
