from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Account, AccountType, User

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    account_type_id: int
    balance: Decimal = Decimal("0.00")
    account_number: Optional[str] = None
    starting_date: Optional[date] = None
    maturity_date: Optional[date] = None
    installment_amount: Optional[Decimal] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type_id: Optional[int] = None
    balance: Optional[Decimal] = None
    account_number: Optional[str] = None
    starting_date: Optional[date] = None
    maturity_date: Optional[date] = None
    installment_amount: Optional[Decimal] = None


def serialize(a: Account) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "account_type_id": a.account_type_id,
        "account_type_name": a.account_type.name if a.account_type else None,
        "balance": float(a.balance),
        "account_number": a.account_number or None,
        "starting_date": a.starting_date.isoformat() if a.starting_date else None,
        "maturity_date": a.maturity_date.isoformat() if a.maturity_date else None,
        "installment_amount": float(a.installment_amount) if a.installment_amount else None,
    }


def get_account_type_or_404(db: Session, type_id: int, user_id: int) -> AccountType:
    t = db.query(AccountType).filter(AccountType.id == type_id, AccountType.user_id == user_id).first()
    if not t:
        raise HTTPException(status_code=400, detail="Invalid account type")
    return t


@router.get("/")
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accounts = db.query(Account).filter(Account.user_id == current_user.id).order_by(Account.created_at).all()
    return [serialize(a) for a in accounts]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_account_type_or_404(db, payload.account_type_id, current_user.id)

    account = Account(**payload.model_dump(), user_id=current_user.id)
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"id": account.id, "message": "Account created"}


@router.put("/{account_id}")
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.account_type_id is not None:
        get_account_type_or_404(db, payload.account_type_id, current_user.id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    return {"message": "Account updated"}


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"message": "Account deleted"}