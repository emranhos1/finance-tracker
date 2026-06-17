from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import AccountType, Account, User

router = APIRouter(prefix="/api/account-types", tags=["account-types"])


class AccountTypeCreate(BaseModel):
    name: str


class AccountTypeUpdate(BaseModel):
    name: str


def serialize(t: AccountType) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/")
def list_account_types(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    types = db.query(AccountType).filter(AccountType.user_id == current_user.id).order_by(AccountType.id).all()
    return [serialize(t) for t in types]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_account_type(payload: AccountTypeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    existing = db.query(AccountType).filter(AccountType.user_id == current_user.id, AccountType.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account type with this name already exists")

    t = AccountType(user_id=current_user.id, name=name)
    db.add(t)
    db.commit()
    db.refresh(t)
    return serialize(t)


@router.put("/{type_id}")
def update_account_type(type_id: int, payload: AccountTypeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = db.query(AccountType).filter(AccountType.id == type_id, AccountType.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Account type not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    dup = db.query(AccountType).filter(
        AccountType.user_id == current_user.id, AccountType.name == name, AccountType.id != type_id
    ).first()
    if dup:
        raise HTTPException(status_code=400, detail="An account type with this name already exists")

    t.name = name
    db.commit()
    return serialize(t)


@router.delete("/{type_id}")
def delete_account_type(type_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = db.query(AccountType).filter(AccountType.id == type_id, AccountType.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Account type not found")

    in_use = db.query(Account).filter(Account.account_type_id == type_id, Account.user_id == current_user.id).count()
    if in_use > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete — {in_use} account(s) use this type")

    db.delete(t)
    db.commit()
    return {"message": "Account type deleted"}