"""
Tests for the authentication service.

Tests cover:
- Password hashing and verification
- JWT token creation and validation
- User creation
- User authentication (login)
"""

import os
from datetime import timedelta

import pytest

# Set test environment before imports
os.environ["OPENBENCH_SECRET_KEY"] = "test-secret-key-for-testing-only-32"
os.environ["OPENBENCH_ENCRYPTION_KEY"] = "test-encryption-key-32-chars-xxx"

from app.services.auth import (
    AuthService,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.models import UserCreate, TokenData


class TestPasswordHashing:
    """Tests for password hashing utilities."""

    def test_hash_password_returns_different_hash(self):
        """Password hashes should be different each time (due to salt)."""
        password = "mysecretpassword"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        assert hash1 != hash2
        assert hash1 != password
        assert hash2 != password

    def test_verify_password_correct(self):
        """Correct password should verify successfully."""
        password = "correctpassword123"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Incorrect password should fail verification."""
        password = "correctpassword123"
        wrong_password = "wrongpassword456"
        hashed = hash_password(password)
        
        assert verify_password(wrong_password, hashed) is False

    def test_verify_password_empty_password(self):
        """Empty password should fail against any hash."""
        password = "somepassword"
        hashed = hash_password(password)
        
        assert verify_password("", hashed) is False


class TestJWTTokens:
    """Tests for JWT token creation and validation."""

    def test_create_access_token_contains_data(self):
        """Created token should contain the provided data."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = create_access_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_access_token_valid(self):
        """Valid token should decode successfully."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = create_access_token(data)
        
        decoded = decode_access_token(token)
        
        assert decoded is not None
        assert isinstance(decoded, TokenData)
        assert decoded.user_id == "user123"
        assert decoded.email == "test@example.com"

    def test_decode_access_token_invalid(self):
        """Invalid token should return None."""
        invalid_token = "invalid.token.here"
        
        decoded = decode_access_token(invalid_token)
        
        assert decoded is None

    def test_decode_access_token_missing_fields(self):
        """Token missing required fields should return None."""
        # Create token without email
        data = {"sub": "user123"}
        token = create_access_token(data)
        
        decoded = decode_access_token(token)
        
        assert decoded is None

    def test_create_access_token_with_expiry(self):
        """Token should be created with custom expiry."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = create_access_token(data, expires_delta=timedelta(hours=1))
        
        decoded = decode_access_token(token)
        
        assert decoded is not None


class TestAuthService:
    """Tests for the AuthService class."""

    @pytest.mark.asyncio
    async def test_create_user_success(self, test_db):
        """User should be created successfully with valid data."""
        auth_service = AuthService()
        user_create = UserCreate(email="newuser@example.com", password="password123")
        
        user = await auth_service.create_user(user_create)
        
        assert user is not None
        assert user.email == "newuser@example.com"
        assert user.hashed_password != "password123"  # Password should be hashed
        assert user.is_active is True

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self, test_db):
        """Creating user with duplicate email should return None."""
        auth_service = AuthService()
        user_create = UserCreate(email="duplicate@example.com", password="password123")
        
        # Create first user
        user1 = await auth_service.create_user(user_create)
        assert user1 is not None
        
        # Try to create duplicate
        user2 = await auth_service.create_user(user_create)
        assert user2 is None

    @pytest.mark.asyncio
    async def test_authenticate_user_success(self, test_db, sample_user_data):
        """User should authenticate with correct credentials."""
        auth_service = AuthService()
        user_create = UserCreate(**sample_user_data)
        
        # Create user
        created_user = await auth_service.create_user(user_create)
        assert created_user is not None
        
        # Authenticate
        authenticated = await auth_service.authenticate_user(
            sample_user_data["email"],
            sample_user_data["password"]
        )
        
        assert authenticated is not None
        assert authenticated.email == sample_user_data["email"]

    @pytest.mark.asyncio
    async def test_authenticate_user_wrong_password(self, test_db, sample_user_data):
        """Authentication should fail with wrong password."""
        auth_service = AuthService()
        user_create = UserCreate(**sample_user_data)
        
        # Create user
        await auth_service.create_user(user_create)
        
        # Try to authenticate with wrong password
        authenticated = await auth_service.authenticate_user(
            sample_user_data["email"],
            "wrongpassword"
        )
        
        assert authenticated is None

    @pytest.mark.asyncio
    async def test_authenticate_user_nonexistent(self, test_db):
        """Authentication should fail for non-existent user."""
        auth_service = AuthService()
        
        authenticated = await auth_service.authenticate_user(
            "nonexistent@example.com",
            "anypassword"
        )
        
        assert authenticated is None

    @pytest.mark.asyncio
    async def test_get_user_by_email(self, test_db, sample_user_data):
        """Should retrieve user by email."""
        auth_service = AuthService()
        user_create = UserCreate(**sample_user_data)
        
        # Create user
        created_user = await auth_service.create_user(user_create)
        
        # Get by email
        retrieved = await auth_service.get_user_by_email(sample_user_data["email"])
        
        assert retrieved is not None
        assert retrieved.user_id == created_user.user_id
        assert retrieved.email == sample_user_data["email"]

    @pytest.mark.asyncio
    async def test_get_user_by_id(self, test_db, sample_user_data):
        """Should retrieve user by ID."""
        auth_service = AuthService()
        user_create = UserCreate(**sample_user_data)
        
        # Create user
        created_user = await auth_service.create_user(user_create)
        
        # Get by ID
        retrieved = await auth_service.get_user_by_id(created_user.user_id)
        
        assert retrieved is not None
        assert retrieved.user_id == created_user.user_id
        assert retrieved.email == sample_user_data["email"]

    @pytest.mark.asyncio
    async def test_create_user_token(self, test_db, sample_user_data):
        """Should create valid JWT token for user."""
        auth_service = AuthService()
        user_create = UserCreate(**sample_user_data)
        
        # Create user
        user = await auth_service.create_user(user_create)
        
        # Create token
        token = auth_service.create_user_token(user)
        
        assert token is not None
        assert token.access_token is not None
        assert token.token_type == "bearer"
        
        # Verify token is valid
        decoded = decode_access_token(token.access_token)
        assert decoded is not None
        assert decoded.user_id == user.user_id
        assert decoded.email == user.email
