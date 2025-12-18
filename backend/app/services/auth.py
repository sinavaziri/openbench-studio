"""
Authentication service for user management and JWT handling.
"""

from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY
from app.db.models import Token, TokenData, User, UserCreate, UserPublic
from app.db.session import get_db


# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        if user_id is None or email is None:
            return None
        return TokenData(user_id=user_id, email=email)
    except JWTError:
        return None


class AuthService:
    """Service for authentication operations."""

    async def create_user(self, user_create: UserCreate) -> Optional[User]:
        """Create a new user. Returns None if email already exists."""
        async with get_db() as db:
            # Check if email already exists
            cursor = await db.execute(
                "SELECT user_id FROM users WHERE email = ?",
                (user_create.email,)
            )
            if await cursor.fetchone():
                return None
            
            # Create user
            user = User(
                email=user_create.email,
                hashed_password=hash_password(user_create.password),
            )
            
            await db.execute(
                """
                INSERT INTO users (user_id, email, hashed_password, created_at, is_active)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    user.user_id,
                    user.email,
                    user.hashed_password,
                    user.created_at.isoformat(),
                    1 if user.is_active else 0,
                ),
            )
            await db.commit()
            return user

    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate a user by email and password."""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get a user by email."""
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_user(row)

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get a user by ID."""
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT * FROM users WHERE user_id = ?",
                (user_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_user(row)

    def create_user_token(self, user: User) -> Token:
        """Create an access token for a user."""
        access_token = create_access_token(
            data={"sub": user.user_id, "email": user.email}
        )
        return Token(access_token=access_token)

    def _row_to_user(self, row) -> User:
        """Convert a database row to a User model."""
        return User(
            user_id=row["user_id"],
            email=row["email"],
            hashed_password=row["hashed_password"],
            created_at=datetime.fromisoformat(row["created_at"]),
            is_active=bool(row["is_active"]),
        )


# Global instance
auth_service = AuthService()



