"""
Authentication routes for user registration, login, and profile.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.errors import InvalidCredentialsError, EmailExistsError
from app.db.models import Token, User, UserCreate, UserLogin, UserPublic
from app.services.auth import auth_service

router = APIRouter()


@router.post("/auth/register", response_model=Token)
async def register(user_create: UserCreate):
    """
    Register a new user account.
    
    Returns an access token on successful registration.
    """
    user = await auth_service.create_user(user_create)
    if user is None:
        raise EmailExistsError(user_create.email)
    return auth_service.create_user_token(user)


@router.post("/auth/login", response_model=Token)
async def login(user_login: UserLogin):
    """
    Login with email and password.
    
    Returns an access token on successful authentication.
    """
    user = await auth_service.authenticate_user(user_login.email, user_login.password)
    if user is None:
        raise InvalidCredentialsError()
    return auth_service.create_user_token(user)


@router.get("/auth/me", response_model=UserPublic)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Get the current authenticated user's profile.
    """
    return UserPublic(
        user_id=current_user.user_id,
        email=current_user.email,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
    )



