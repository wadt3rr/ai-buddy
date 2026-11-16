from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10000)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    user_id: UUID
    team_role: Literal["intern", "mentor"]
    messages: list[Message] = Field(min_length=1, max_length=20)


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    doc_id: str
    key: Literal["python_version", "postgres_version", "launch_command", "access_procedure"]
    value: str = Field(min_length=1, max_length=200)
    quote: str = Field(min_length=1, max_length=600)


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claims: list[Claim] = Field(max_length=40)
