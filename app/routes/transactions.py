from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Transaction, Account, Category

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class TransactionCreate(BaseModel):
    date: date
    type: str
    amount: Decimal
    category_id: Optional[int] = None
    from_account_id: Optional[int] = None
    to_account_id: Optional[int] = None
    note: Optional[str] = None


class TransferCreate(BaseModel):
    date: date
    amount: Decimal
    from_account_id: int
    to_account_id: int
    note: Optional[str] = None


def serialize_transaction(t: Transaction) -> dict:
    return {
        "id": t.id,
        "date": t.date.isoformat(),
        "type": t.type,
        "amount": float(t.amount),
        "category_id": t.category_id,
        "category_name": t.category.name if t.category else None,
        "from_account_id": t.from_account_id,
        "from_account_name": t.from_account.name if t.from_account else None,
        "to_account_id": t.to_account_id,
        "to_account_name": t.to_account.name if t.to_account else None,
        "note": t.note,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/")
def list_transactions(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    account_id: Optional[int] = None,
    type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Transaction)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if account_id:
        query = query.filter(
            (Transaction.from_account_id == account_id) | (Transaction.to_account_id == account_id)
        )
    if type:
        query = query.filter(Transaction.type == type)
    transactions = query.order_by(Transaction.date.desc(), Transaction.created_at.desc()).limit(limit).all()
    return [serialize_transaction(t) for t in transactions]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if payload.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Use /transfer for transfer type")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    try:
        # Double-entry: update account balance atomically
        if payload.type == "income":
            if not payload.to_account_id:
                raise HTTPException(status_code=400, detail="to_account_id required for income")
            account = db.query(Account).filter(Account.id == payload.to_account_id).with_for_update().first()
            if not account:
                raise HTTPException(status_code=404, detail="Destination account not found")
            account.balance += payload.amount

        elif payload.type == "expense":
            if not payload.from_account_id:
                raise HTTPException(status_code=400, detail="from_account_id required for expense")
            account = db.query(Account).filter(Account.id == payload.from_account_id).with_for_update().first()
            if not account:
                raise HTTPException(status_code=404, detail="Source account not found")
            account.balance -= payload.amount

        txn = Transaction(**payload.model_dump())
        db.add(txn)
        db.commit()
        db.refresh(txn)
        return {"id": txn.id, "message": "Transaction recorded"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfer", status_code=status.HTTP_201_CREATED)
def create_transfer(payload: TransferCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts must differ")

    try:
        from_account = db.query(Account).filter(Account.id == payload.from_account_id).with_for_update().first()
        to_account = db.query(Account).filter(Account.id == payload.to_account_id).with_for_update().first()

        if not from_account:
            raise HTTPException(status_code=404, detail="Source account not found")
        if not to_account:
            raise HTTPException(status_code=404, detail="Destination account not found")

        # Atomic double-entry
        from_account.balance -= payload.amount
        to_account.balance += payload.amount

        txn = Transaction(
            date=payload.date,
            type="transfer",
            amount=payload.amount,
            from_account_id=payload.from_account_id,
            to_account_id=payload.to_account_id,
            note=payload.note,
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)
        return {"id": txn.id, "message": "Transfer recorded"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{txn_id}")
def delete_transaction(txn_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    try:
        # Reverse the balance effect
        if txn.type == "income" and txn.to_account_id:
            acc = db.query(Account).filter(Account.id == txn.to_account_id).with_for_update().first()
            if acc:
                acc.balance -= txn.amount
        elif txn.type == "expense" and txn.from_account_id:
            acc = db.query(Account).filter(Account.id == txn.from_account_id).with_for_update().first()
            if acc:
                acc.balance += txn.amount
        elif txn.type == "transfer":
            from_acc = db.query(Account).filter(Account.id == txn.from_account_id).with_for_update().first()
            to_acc = db.query(Account).filter(Account.id == txn.to_account_id).with_for_update().first()
            if from_acc:
                from_acc.balance += txn.amount
            if to_acc:
                to_acc.balance -= txn.amount

        db.delete(txn)
        db.commit()
        return {"message": "Transaction deleted and balances reversed"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
