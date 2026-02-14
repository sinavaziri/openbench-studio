"""
Authentication routes for user registration, login, and profile management.

All authentication uses JWT tokens with Bearer authentication scheme.
"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.core.errors import InvalidCredentialsError, EmailExistsError, ErrorResponse
from app.db.models import Token, User, UserCreate, UserLogin, UserPublic
from app.services.auth import auth_service

router = APIRouter()


@router.post(
    "/auth/register",
    response_model=Token,
    summary="Register new account",
    description="Create a new user account and receive an access token.",
    responses={
        200: {
            "description": "Successfully registered",
            "model": Token,
        },
        400: {
            "description": "Email already exists",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "An account with this email already exists"
                    }
                }
            }
        },
        422: {
            "description": "Validation error (invalid email or password too short)",
        }
    }
)
async def register(user_create: UserCreate):
    """
    Register a new user account.
    
    Creates a new account with the provided email and password.
    Returns a JWT access token on successful registration.
    
    **Password requirements:**
    - Minimum 8 characters
    
    **Example:**
    ```json
    {
        "email": "user@example.com",
        "password": "securepassword123"
    }
    ```
    """
    user = await auth_service.create_user(user_create)
    if user is None:
        raise EmailExistsError(user_create.email)
    return auth_service.create_user_token(user)


@router.post(
    "/auth/login",
    response_model=Token,
    summary="Login",
    description="Authenticate with email and password to receive an access token.",
    responses={
        200: {
            "description": "Successfully authenticated",
            "model": Token,
        },
        401: {
            "description": "Invalid credentials",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "The email or password you entered is incorrect"
                    }
                }
            }
        }
    }
)
async def login(user_login: UserLogin):
    """
    Login with email and password.
    
    Authenticates the user and returns a JWT access token.
    The token is valid for 7 days.
    
    **Usage:**
    Include the returned token in the `Authorization` header for authenticated requests:
    ```
    Authorization: Bearer <access_token>
    ```
    """
    user = await auth_service.authenticate_user(user_login.email, user_login.password)
    if user is None:
        raise InvalidCredentialsError()
    return auth_service.create_user_token(user)


@router.get(
    "/auth/me",
    response_model=UserPublic,
    summary="Get current user",
    description="Get the profile of the currently authenticated user.",
    responses={
        200: {
            "description": "User profile",
            "model": UserPublic,
        },
        401: {
            "description": "Not authenticated",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Authentication required"
                    }
                }
            }
        }
    }
)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Get the current authenticated user's profile.
    
    Returns public user information including:
    - User ID
    - Email address
    - Account creation date
    - Active status
    
    **Requires authentication.**
    """
    return UserPublic(
        user_id=current_user.user_id,
        email=current_user.email,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
    )
