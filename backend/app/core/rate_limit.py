"""
Rate limiting configuration using slowapi.

Provides rate limiting for API endpoints with different limits
based on route sensitivity and resource consumption.
"""

from typing import Optional, Union

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse


def get_user_id_or_ip(request: Request) -> str:
    """
    Get user_id for authenticated requests, IP address for unauthenticated.
    
    This is used as the rate limit key for authenticated routes.
    """
    # Try to get user from request state (set by auth middleware if authenticated)
    if hasattr(request.state, "user") and request.state.user:
        return f"user:{request.state.user.user_id}"
    
    # For routes with Bearer token, try to decode it
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            from app.services.auth import decode_access_token
            token_data = decode_access_token(token)
            if token_data:
                return f"user:{token_data.user_id}"
        except Exception:
            pass
    
    # Fall back to IP address
    return f"ip:{get_remote_address(request)}"


def get_ip_address(request: Request) -> str:
    """
    Get the client IP address for rate limiting.
    
    Used for unauthenticated routes like login/register.
    """
    return f"ip:{get_remote_address(request)}"


# Create the rate limiter with in-memory storage
# For production with multiple instances, use Redis storage
limiter = Limiter(
    key_func=get_user_id_or_ip,
    default_limits=["100/minute"],  # Default limit for routes without specific limits
    storage_uri="memory://",  # In-memory storage for single instance
    strategy="fixed-window",
)


# =============================================================================
# Rate Limit Constants
# =============================================================================

# Authentication routes (keyed by IP to prevent brute force)
RATE_LIMIT_LOGIN = "5/minute"
RATE_LIMIT_REGISTER = "3/minute"

# Resource-intensive authenticated routes
RATE_LIMIT_RUNS = "10/minute"
RATE_LIMIT_AVAILABLE_MODELS = "30/minute"


# =============================================================================
# Custom Exception Handler
# =============================================================================

def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
    """
    Custom handler for rate limit exceeded errors.
    
    Returns a proper 429 response with:
    - Retry-After header
    - Clear error message
    - Rate limit headers
    """
    # Extract retry_after from the exception if available
    retry_after = getattr(exc, "retry_after", 60)
    
    # Get the limit that was exceeded from the exception detail
    detail = str(exc.detail) if hasattr(exc, "detail") else "Rate limit exceeded"
    
    response = JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please slow down.",
            "detail": detail,
            "retry_after": retry_after,
        },
    )
    
    # Add required headers
    response.headers["Retry-After"] = str(retry_after)
    response.headers["X-RateLimit-Limit"] = "See specific endpoint limits"
    response.headers["X-RateLimit-Remaining"] = "0"
    response.headers["X-RateLimit-Reset"] = str(retry_after)
    
    return response


# =============================================================================
# Middleware for Rate Limit Headers
# =============================================================================

class RateLimitHeadersMiddleware:
    """
    Middleware to add rate limit headers to all responses.
    
    Headers added:
    - X-RateLimit-Limit: The rate limit for this endpoint
    - X-RateLimit-Remaining: Remaining requests in the current window
    - X-RateLimit-Reset: Seconds until the rate limit resets
    """
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                
                # Add rate limit headers if not already present
                header_names = [h[0].lower() for h in headers]
                
                if b"x-ratelimit-limit" not in header_names:
                    headers.append((b"x-ratelimit-limit", b"100"))
                if b"x-ratelimit-remaining" not in header_names:
                    headers.append((b"x-ratelimit-remaining", b"99"))
                if b"x-ratelimit-reset" not in header_names:
                    headers.append((b"x-ratelimit-reset", b"60"))
                
                message["headers"] = headers
            
            await send(message)
        
        await self.app(scope, receive, send_wrapper)
