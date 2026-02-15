"""
Tests for authentication API routes.

Tests cover:
- User registration
- User login
- Get current user profile
- Authentication error handling
"""

import pytest


class TestRegisterEndpoint:
    """Tests for /api/auth/register endpoint."""

    @pytest.mark.asyncio
    async def test_register_new_user(self, client, test_db):
        """Should register a new user and return a token."""
        response = await client.post(
            "/api/auth/register",
            json={"email": "newuser@example.com", "password": "securepass123"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client, test_db):
        """Should reject registration with duplicate email."""
        user_data = {"email": "duplicate@example.com", "password": "password123"}
        
        # Register first time
        response1 = await client.post("/api/auth/register", json=user_data)
        assert response1.status_code == 200
        
        # Register again with same email
        response2 = await client.post("/api/auth/register", json=user_data)
        assert response2.status_code == 400
        assert "already exists" in response2.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client, test_db):
        """Should reject invalid email format."""
        response = await client.post(
            "/api/auth/register",
            json={"email": "invalid-email", "password": "password123"}
        )
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_register_short_password(self, client, test_db):
        """Should reject password shorter than minimum length."""
        response = await client.post(
            "/api/auth/register",
            json={"email": "user@example.com", "password": "short"}
        )
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_register_missing_email(self, client, test_db):
        """Should reject request without email."""
        response = await client.post(
            "/api/auth/register",
            json={"password": "password123"}
        )
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_register_missing_password(self, client, test_db):
        """Should reject request without password."""
        response = await client.post(
            "/api/auth/register",
            json={"email": "user@example.com"}
        )
        
        assert response.status_code == 422


class TestLoginEndpoint:
    """Tests for /api/auth/login endpoint."""

    @pytest.mark.asyncio
    async def test_login_valid_credentials(self, client, test_db):
        """Should login with valid credentials and return token."""
        # First register
        await client.post(
            "/api/auth/register",
            json={"email": "login@example.com", "password": "loginpass123"}
        )
        
        # Then login
        response = await client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "loginpass123"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client, test_db):
        """Should reject login with wrong password."""
        # First register
        await client.post(
            "/api/auth/register",
            json={"email": "wrongpass@example.com", "password": "correctpass"}
        )
        
        # Try login with wrong password
        response = await client.post(
            "/api/auth/login",
            json={"email": "wrongpass@example.com", "password": "incorrectpass"}
        )
        
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client, test_db):
        """Should reject login for non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "anypassword"}
        )
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_missing_email(self, client, test_db):
        """Should reject login without email."""
        response = await client.post(
            "/api/auth/login",
            json={"password": "password123"}
        )
        
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_login_missing_password(self, client, test_db):
        """Should reject login without password."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "user@example.com"}
        )
        
        assert response.status_code == 422


class TestGetMeEndpoint:
    """Tests for /api/auth/me endpoint."""

    @pytest.mark.asyncio
    async def test_get_me_authenticated(self, authenticated_client):
        """Should return user profile when authenticated."""
        client, auth_info = authenticated_client
        
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "testuser@example.com"
        assert "user_id" in data
        assert "created_at" in data
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_get_me_no_auth(self, client, test_db):
        """Should reject request without authentication."""
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_invalid_token(self, client, test_db):
        """Should reject request with invalid token."""
        client.headers["Authorization"] = "Bearer invalid_token"
        
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_expired_token(self, client, test_db):
        """Should reject request with malformed token."""
        client.headers["Authorization"] = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_missing_bearer(self, client, test_db):
        """Should reject request without Bearer prefix."""
        client.headers["Authorization"] = "some_token_without_bearer"
        
        response = await client.get("/api/auth/me")
        
        # FastAPI's OAuth2 scheme may return different codes
        assert response.status_code in [401, 403]
