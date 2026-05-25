from pydantic import BaseModel, field_validator
from typing import Optional


class ExpenseCreate(BaseModel):
    date: str
    amount: int
    description: Optional[str] = None
    category_id: int
    account_id: int

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[int] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    account_id: Optional[int] = None


class IncomeCreate(BaseModel):
    date: str
    amount: int
    description: Optional[str] = None
    source_id: int
    account_id: int

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class IncomeUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[int] = None
    description: Optional[str] = None
    source_id: Optional[int] = None
    account_id: Optional[int] = None


class TransferCreate(BaseModel):
    date: str
    amount: int
    fees: int = 0
    description: Optional[str] = None
    from_account_id: int
    to_account_id: int

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("fees")
    @classmethod
    def fees_non_negative(cls, v):
        if v < 0:
            raise ValueError("Fees cannot be negative")
        return v


class TransferUpdate(BaseModel):
    date: Optional[str] = None
    amount: Optional[int] = None
    fees: Optional[int] = None
    description: Optional[str] = None
    from_account_id: Optional[int] = None
    to_account_id: Optional[int] = None


class RolloverSet(BaseModel):
    account_id: int
    year: int
    month: int
    amount: int


class BudgetExpenseSet(BaseModel):
    category_id: int
    year: int
    month: int
    planned: int


class BudgetIncomeSet(BaseModel):
    source_id: int
    year: int
    month: int
    planned: int


# ── Reference data CRUD ──────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    type: str
    sort_order: int = 99

    @field_validator("type")
    @classmethod
    def valid_type(cls, v):
        if v not in ("liquid", "financial", "credit"):
            raise ValueError("type must be liquid, financial, or credit")
        return v

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v):
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    sort_order: Optional[int] = None

    @field_validator("type")
    @classmethod
    def valid_type(cls, v):
        if v is not None and v not in ("liquid", "financial", "credit"):
            raise ValueError("type must be liquid, financial, or credit")
        return v


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 99

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v):
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class SourceCreate(BaseModel):
    name: str
    sort_order: int = 99

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v):
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
