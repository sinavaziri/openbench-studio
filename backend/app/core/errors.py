"""
Custom error handling for OpenBench API.

Provides:
- Structured error responses
- Consistent error codes
- User-friendly error messages
"""

from typing import Any, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """Structured error response model."""
    code: str
    message: str
    detail: Optional[str] = None
    field: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard API error response."""
    error: ErrorDetail


# =============================================================================
# Error Codes
# =============================================================================

class ErrorCode:
    """Centralized error codes for the API."""
    
    # Authentication errors (AUTH_xxx)
    AUTH_REQUIRED = "AUTH_REQUIRED"
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID"
    AUTH_EMAIL_EXISTS = "AUTH_EMAIL_EXISTS"
    
    # Authorization errors (AUTHZ_xxx)
    AUTHZ_FORBIDDEN = "AUTHZ_FORBIDDEN"
    AUTHZ_NOT_OWNER = "AUTHZ_NOT_OWNER"
    
    # Resource errors (RESOURCE_xxx)
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    
    # Run errors (RUN_xxx)
    RUN_NOT_FOUND = "RUN_NOT_FOUND"
    RUN_STILL_RUNNING = "RUN_STILL_RUNNING"
    RUN_NOT_RUNNING = "RUN_NOT_RUNNING"
    RUN_ALREADY_COMPLETED = "RUN_ALREADY_COMPLETED"
    RUN_DELETE_FAILED = "RUN_DELETE_FAILED"
    
    # API Key errors (APIKEY_xxx)
    APIKEY_NOT_FOUND = "APIKEY_NOT_FOUND"
    APIKEY_INVALID = "APIKEY_INVALID"
    APIKEY_REQUIRED = "APIKEY_REQUIRED"
    
    # Validation errors (VALIDATION_xxx)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    VALIDATION_FIELD_REQUIRED = "VALIDATION_FIELD_REQUIRED"
    VALIDATION_FIELD_INVALID = "VALIDATION_FIELD_INVALID"
    
    # Server errors (SERVER_xxx)
    SERVER_ERROR = "SERVER_ERROR"
    SERVER_UNAVAILABLE = "SERVER_UNAVAILABLE"
    
    # External service errors (EXTERNAL_xxx)
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    EXTERNAL_TIMEOUT = "EXTERNAL_TIMEOUT"


# =============================================================================
# Custom Exceptions
# =============================================================================

class APIError(HTTPException):
    """Base API error with structured response."""
    
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Optional[str] = None,
        field: Optional[str] = None,
        headers: Optional[dict] = None,
    ):
        error_detail = {
            "code": code,
            "message": message,
        }
        if detail:
            error_detail["detail"] = detail
        if field:
            error_detail["field"] = field
            
        super().__init__(
            status_code=status_code,
            detail=message,  # FastAPI uses 'detail' for the response body
            headers=headers,
        )
        self.code = code
        self.error_message = message
        self.error_detail = detail
        self.field = field


# =============================================================================
# Specific Error Types
# =============================================================================

class AuthenticationError(APIError):
    """Authentication required or failed."""
    
    def __init__(
        self,
        message: str = "Authentication required",
        code: str = ErrorCode.AUTH_REQUIRED,
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=code,
            message=message,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class InvalidCredentialsError(AuthenticationError):
    """Invalid email or password."""
    
    def __init__(self):
        super().__init__(
            message="The email or password you entered is incorrect",
            code=ErrorCode.AUTH_INVALID_CREDENTIALS,
            detail="Please check your credentials and try again.",
        )


class EmailExistsError(APIError):
    """Email already registered."""
    
    def __init__(self, email: str = ""):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=ErrorCode.AUTH_EMAIL_EXISTS,
            message="An account with this email already exists",
            detail="Try signing in instead, or use a different email address.",
            field="email",
        )


class ForbiddenError(APIError):
    """Access forbidden."""
    
    def __init__(
        self,
        message: str = "You don't have permission to perform this action",
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCode.AUTHZ_FORBIDDEN,
            message=message,
            detail=detail,
        )


class NotFoundError(APIError):
    """Resource not found."""
    
    def __init__(
        self,
        resource: str = "Resource",
        resource_id: Optional[str] = None,
        detail: Optional[str] = None,
    ):
        message = f"{resource} not found"
        if resource_id:
            detail = detail or f"No {resource.lower()} found with ID: {resource_id}"
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code=ErrorCode.RESOURCE_NOT_FOUND,
            message=message,
            detail=detail,
        )


class RunNotFoundError(NotFoundError):
    """Benchmark run not found."""
    
    def __init__(self, run_id: str):
        super().__init__(
            resource="Run",
            resource_id=run_id,
            detail="This benchmark run may have been deleted or the ID is incorrect.",
        )


class RunStillRunningError(APIError):
    """Cannot perform action on running benchmark."""
    
    def __init__(self, action: str = "modify"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=ErrorCode.RUN_STILL_RUNNING,
            message=f"Cannot {action} a running benchmark",
            detail="Cancel the benchmark first, then try again.",
        )


class RunNotRunningError(APIError):
    """Run is not currently running."""
    
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=ErrorCode.RUN_NOT_RUNNING,
            message="This benchmark is not currently running",
            detail="The benchmark may have already completed or failed.",
        )


class ApiKeyNotFoundError(NotFoundError):
    """API key not found for provider."""
    
    def __init__(self, provider: str):
        super().__init__(
            resource="API key",
            detail=f"No API key configured for provider: {provider}. Add one in Settings.",
        )


class ValidationError(APIError):
    """Validation error for request data."""
    
    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            detail=detail,
            field=field,
        )


class ConflictError(APIError):
    """Resource conflict."""
    
    def __init__(
        self,
        message: str = "This action conflicts with existing data",
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code=ErrorCode.RESOURCE_CONFLICT,
            message=message,
            detail=detail,
        )


class ServerError(APIError):
    """Internal server error."""
    
    def __init__(
        self,
        message: str = "Something went wrong on our end",
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=ErrorCode.SERVER_ERROR,
            message=message,
            detail=detail or "Please try again. If the problem persists, contact support.",
        )


class ExternalServiceError(APIError):
    """Error communicating with external service."""
    
    def __init__(
        self,
        service: str,
        detail: Optional[str] = None,
    ):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message=f"Error communicating with {service}",
            detail=detail or "The external service may be temporarily unavailable.",
        )


# =============================================================================
# Helper Functions
# =============================================================================

def create_error_response(
    code: str,
    message: str,
    detail: Optional[str] = None,
    field: Optional[str] = None,
) -> dict:
    """Create a structured error response dict."""
    response = {
        "error": {
            "code": code,
            "message": message,
        }
    }
    if detail:
        response["error"]["detail"] = detail
    if field:
        response["error"]["field"] = field
    return response
