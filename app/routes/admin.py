from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user
from app.models.models import User, Transaction, Account

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).filter(User.role == "user").order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users/{user_id}/activate")
def activate_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id, User.role == "user").first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    db.commit()
    return {"message": f"User '{user.username}' activated"}


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id, User.role == "user").first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"message": f"User '{user.username}' deactivated"}


@router.get("/users/{user_id}/report")
def user_report(
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    today = date.today()
    start = start_date or date(today.year, 1, 1)
    end   = end_date   or today

    txns = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.date >= start,
        Transaction.date <= end,
    ).order_by(Transaction.date.desc()).all()

    income  = sum(float(t.amount) for t in txns if t.type == "income")
    expense = sum(float(t.amount) for t in txns if t.type == "expense")

    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    net_worth = sum(float(a.balance) for a in accounts)

    return {
        "user": {"id": user.id, "username": user.username, "email": user.email},
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "summary": {"income": income, "expense": expense, "net": income - expense, "net_worth": net_worth},
        "transactions": [
            {
                "date": t.date.isoformat(),
                "type": t.type,
                "amount": float(t.amount),
                "category": t.category.name if t.category else "—",
                "note": t.note or "—",
            }
            for t in txns
        ],
        "accounts": [
            {"name": a.name, "type": a.type, "balance": float(a.balance)}
            for a in accounts
        ],
    }


@router.get("/users/pending-count")
def pending_count(db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(User).filter(User.role == "user", User.is_active == False).count()
    return {"count": count}