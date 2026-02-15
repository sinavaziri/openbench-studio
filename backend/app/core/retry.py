"""
Exponential backoff retry logic for transient error handling.

Provides:
- Exponential backoff with configurable base delay
- Max retry limits (default: 5)
- Retryable status code detection (429, 500, 502, 503, 504)
- Non-retryable status code detection (400, 401, 403, 404)
- Per-provider configuration options
- Comprehensive logging for debugging
"""

import asyncio
import functools
import logging
import random
from dataclasses import dataclass, field
from datetime import datetime
from enum import IntEnum
from typing import Any, Callable, Optional, Set, TypeVar, Union

import httpx

logger = logging.getLogger(__name__)


# Status codes that should trigger a retry
RETRYABLE_STATUS_CODES: Set[int] = {429, 500, 502, 503, 504}

# Status codes that should NOT be retried
NON_RETRYABLE_STATUS_CODES: Set[int] = {400, 401, 403, 404}


class RetryableError(Exception):
    """Exception indicating a retryable error occurred."""
    
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        provider: Optional[str] = None,
        attempt: int = 0,
        max_retries: int = 5,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider
        self.attempt = attempt
        self.max_retries = max_retries


class NonRetryableError(Exception):
    """Exception indicating a non-retryable error occurred."""
    
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        provider: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    
    # Maximum number of retry attempts
    max_retries: int = 5
    
    # Base delay in seconds (will be multiplied by 2^attempt)
    base_delay: float = 1.0
    
    # Maximum delay cap in seconds
    max_delay: float = 32.0
    
    # Add random jitter to prevent thundering herd
    jitter: bool = True
    
    # Jitter range as fraction of delay (0.0 to 0.5 recommended)
    jitter_range: float = 0.25
    
    # Status codes to retry on
    retryable_status_codes: Set[int] = field(
        default_factory=lambda: RETRYABLE_STATUS_CODES.copy()
    )
    
    # Status codes to never retry
    non_retryable_status_codes: Set[int] = field(
        default_factory=lambda: NON_RETRYABLE_STATUS_CODES.copy()
    )
    
    # Retry on connection errors
    retry_on_connection_error: bool = True
    
    # Retry on timeout errors
    retry_on_timeout: bool = True


# Default configuration
DEFAULT_RETRY_CONFIG = RetryConfig()

# Provider-specific configurations
PROVIDER_RETRY_CONFIGS: dict[str, RetryConfig] = {
    # OpenAI has aggressive rate limits, use longer backoff
    "openai": RetryConfig(
        max_retries=5,
        base_delay=2.0,
        max_delay=64.0,
    ),
    # Anthropic is generally more forgiving
    "anthropic": RetryConfig(
        max_retries=5,
        base_delay=1.0,
        max_delay=32.0,
    ),
    # Google can have longer processing times
    "google": RetryConfig(
        max_retries=5,
        base_delay=1.5,
        max_delay=48.0,
    ),
    # Default for unknown providers
    "default": DEFAULT_RETRY_CONFIG,
}


def get_retry_config(provider: Optional[str] = None) -> RetryConfig:
    """
    Get retry configuration for a specific provider.
    
    Args:
        provider: Provider name (e.g., 'openai', 'anthropic')
        
    Returns:
        RetryConfig for the provider, or default if not found
    """
    if provider and provider.lower() in PROVIDER_RETRY_CONFIGS:
        return PROVIDER_RETRY_CONFIGS[provider.lower()]
    return DEFAULT_RETRY_CONFIG


def calculate_delay(attempt: int, config: RetryConfig) -> float:
    """
    Calculate delay for a retry attempt using exponential backoff.
    
    Pattern: 1s → 2s → 4s → 8s → 16s → 32s (with default config)
    
    Args:
        attempt: Current attempt number (0-indexed)
        config: Retry configuration
        
    Returns:
        Delay in seconds
    """
    # Exponential backoff: base_delay * 2^attempt
    delay = config.base_delay * (2 ** attempt)
    
    # Cap at max_delay
    delay = min(delay, config.max_delay)
    
    # Add jitter if enabled
    if config.jitter:
        jitter_amount = delay * config.jitter_range
        delay += random.uniform(-jitter_amount, jitter_amount)
        # Ensure delay is positive
        delay = max(0.1, delay)
    
    return delay


def is_retryable_status_code(status_code: int, config: RetryConfig = DEFAULT_RETRY_CONFIG) -> bool:
    """
    Check if a status code should trigger a retry.
    
    Args:
        status_code: HTTP status code
        config: Retry configuration
        
    Returns:
        True if the status code is retryable
    """
    if status_code in config.non_retryable_status_codes:
        return False
    return status_code in config.retryable_status_codes


def is_retryable_exception(
    exc: Exception,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
) -> bool:
    """
    Check if an exception should trigger a retry.
    
    Args:
        exc: The exception to check
        config: Retry configuration
        
    Returns:
        True if the exception is retryable
    """
    # Connection errors
    if config.retry_on_connection_error:
        if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, ConnectionError)):
            return True
    
    # Timeout errors
    if config.retry_on_timeout:
        if isinstance(exc, (httpx.TimeoutException, asyncio.TimeoutError)):
            return True
    
    # HTTP status code errors
    if isinstance(exc, httpx.HTTPStatusError):
        return is_retryable_status_code(exc.response.status_code, config)
    
    # Our custom retryable error
    if isinstance(exc, RetryableError):
        return True
    
    return False


@dataclass
class RetryResult:
    """Result of a retry operation."""
    success: bool
    result: Any = None
    error: Optional[Exception] = None
    attempts: int = 0
    total_delay: float = 0.0
    final_status_code: Optional[int] = None


T = TypeVar('T')


async def with_retry(
    func: Callable[..., T],
    *args,
    config: Optional[RetryConfig] = None,
    provider: Optional[str] = None,
    operation_name: str = "operation",
    on_retry: Optional[Callable[[int, float, Exception], None]] = None,
    **kwargs,
) -> T:
    """
    Execute an async function with retry logic.
    
    Args:
        func: Async function to execute
        *args: Positional arguments for the function
        config: Retry configuration (overrides provider config if both provided)
        provider: Provider name for provider-specific config
        operation_name: Name for logging purposes
        on_retry: Optional callback called on each retry (attempt, delay, exception)
        **kwargs: Keyword arguments for the function
        
    Returns:
        Result of the function
        
    Raises:
        NonRetryableError: If a non-retryable error occurs
        RetryableError: If all retries are exhausted
    """
    if config is None:
        config = get_retry_config(provider)
    
    last_exception: Optional[Exception] = None
    total_delay = 0.0
    
    for attempt in range(config.max_retries + 1):
        try:
            if attempt > 0:
                delay = calculate_delay(attempt - 1, config)
                total_delay += delay
                
                logger.info(
                    f"Retry attempt {attempt}/{config.max_retries} for {operation_name} "
                    f"after {delay:.2f}s delay (total delay: {total_delay:.2f}s)"
                )
                
                if on_retry:
                    on_retry(attempt, delay, last_exception)
                
                await asyncio.sleep(delay)
            
            result = await func(*args, **kwargs)
            
            if attempt > 0:
                logger.info(
                    f"{operation_name} succeeded after {attempt} retries "
                    f"(total delay: {total_delay:.2f}s)"
                )
            
            return result
            
        except Exception as exc:
            last_exception = exc
            status_code = None
            
            # Extract status code if available
            if isinstance(exc, httpx.HTTPStatusError):
                status_code = exc.response.status_code
            elif isinstance(exc, (RetryableError, NonRetryableError)):
                status_code = exc.status_code
            
            # Check if non-retryable
            if isinstance(exc, NonRetryableError):
                logger.warning(
                    f"{operation_name} failed with non-retryable error: {exc} "
                    f"(status: {status_code})"
                )
                raise
            
            if status_code and status_code in config.non_retryable_status_codes:
                logger.warning(
                    f"{operation_name} failed with non-retryable status code {status_code}"
                )
                raise NonRetryableError(
                    str(exc),
                    status_code=status_code,
                    provider=provider,
                ) from exc
            
            # Check if retryable
            if not is_retryable_exception(exc, config):
                logger.error(
                    f"{operation_name} failed with non-retryable exception: {exc}"
                )
                raise
            
            # Log retry attempt
            if attempt < config.max_retries:
                logger.warning(
                    f"{operation_name} failed (attempt {attempt + 1}/{config.max_retries + 1}): "
                    f"{exc} (status: {status_code})"
                )
            else:
                logger.error(
                    f"{operation_name} failed after {config.max_retries + 1} attempts: "
                    f"{exc} (status: {status_code})"
                )
    
    # All retries exhausted
    raise RetryableError(
        f"{operation_name} failed after {config.max_retries + 1} attempts: {last_exception}",
        status_code=getattr(last_exception, 'status_code', None),
        provider=provider,
        attempt=config.max_retries,
        max_retries=config.max_retries,
    ) from last_exception


def retry_async(
    config: Optional[RetryConfig] = None,
    provider: Optional[str] = None,
    operation_name: Optional[str] = None,
):
    """
    Decorator for adding retry logic to async functions.
    
    Args:
        config: Retry configuration
        provider: Provider name for provider-specific config
        operation_name: Name for logging (defaults to function name)
        
    Usage:
        @retry_async(provider="openai")
        async def fetch_models():
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            name = operation_name or func.__name__
            return await with_retry(
                func,
                *args,
                config=config,
                provider=provider,
                operation_name=name,
                **kwargs,
            )
        return wrapper
    return decorator


@dataclass
class RetryState:
    """
    Tracks retry state for a specific operation.
    
    Useful for updating UI or logging during retries.
    """
    operation: str
    provider: Optional[str] = None
    max_retries: int = 5
    current_attempt: int = 0
    is_retrying: bool = False
    last_error: Optional[str] = None
    last_status_code: Optional[int] = None
    started_at: Optional[datetime] = None
    total_delay: float = 0.0
    
    def start_retry(self, error: str, status_code: Optional[int] = None):
        """Mark that a retry is starting."""
        self.current_attempt += 1
        self.is_retrying = True
        self.last_error = error
        self.last_status_code = status_code
        if not self.started_at:
            self.started_at = datetime.utcnow()
    
    def add_delay(self, delay: float):
        """Track delay time."""
        self.total_delay += delay
    
    def complete(self, success: bool):
        """Mark the operation as complete."""
        self.is_retrying = False
        if success:
            self.last_error = None
            self.last_status_code = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for WebSocket/API responses."""
        return {
            "operation": self.operation,
            "provider": self.provider,
            "current_attempt": self.current_attempt,
            "max_retries": self.max_retries,
            "is_retrying": self.is_retrying,
            "last_error": self.last_error,
            "last_status_code": self.last_status_code,
            "total_delay": round(self.total_delay, 2),
        }
