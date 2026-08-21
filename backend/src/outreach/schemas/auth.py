"""What crosses the wire for accounts. Passwords go in, never out."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

#: Long enough to matter, short enough that nobody reaches for a sticky note.
#: Length beats character-class rules: "P@ss1!" satisfies most complexity
#: policies and is guessed in seconds.
MIN_PASSWORD = 8


class SignUpIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)

    @field_validator("name")
    @classmethod
    def _tidy_name(cls, value: str) -> str:
        return " ".join(value.split())


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    created_at: datetime
    last_login_at: datetime | None = None
