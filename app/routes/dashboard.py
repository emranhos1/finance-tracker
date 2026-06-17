from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Transaction, Account, AccountType, Category, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
reports_router = APIRouter(prefix="/api/reports", tags=["reports"])


def _dashboard_bucket(type_name: str):
    """Internal helper: which dashboard total an account's balance counts toward."""
    n = (type_name or "").strip().upper()
    if n == "CASH": return "cash"
    if n == "BANK": return "bank"
    if n in ("DPS", "FDR"): return "savings"
    if n == "PLOT": return "plot"
    return None


def serialize_account(a: Account) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "account_type_name": a.account_type.name if a.account_type else None,
        "balance": float(a.balance),
    }


def get_cash_out_for_period(db: Session, user_id: int, start: date, end: date, cash_ids: list) -> float:
    if not cash_ids: return 0.0
    expense_out = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == user_id, Transaction.type == 'expense',
        Transaction.from_account_id.in_(cash_ids), Transaction.date >= start, Transaction.date <= end,
    ).scalar()
    transfer_out = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == user_id, Transaction.type == 'transfer',
        Transaction.from_account_id.in_(cash_ids), Transaction.date >= start, Transaction.date <= end,
    ).scalar()
    return float(expense_out or 0) + float(transfer_out or 0)


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    uid   = current_user.id
    today = date.today()
    month_start = today.replace(day=1)
    year_start  = today.replace(month=1, day=1)

    accounts = db.query(Account).filter(Account.user_id == uid).all()

    cash_total    = 0.0
    bank_total    = 0.0
    savings_total = 0.0
    plot_total    = 0.0
    cash_ids      = []

    for a in accounts:
        bucket = _dashboard_bucket(a.account_type.name) if a.account_type else None
        balance = float(a.balance)
        if bucket == 'cash':
            cash_total += balance
            cash_ids.append(a.id)
        elif bucket == 'bank':
            bank_total += balance
        elif bucket == 'savings':
            savings_total += balance
        elif bucket == 'plot':
            plot_total += balance

    net_worth = bank_total + savings_total
    current_cash = cash_total

    today_out = get_cash_out_for_period(db, uid, today, today, cash_ids)
    month_out = get_cash_out_for_period(db, uid, month_start, today, cash_ids)
    year_out  = get_cash_out_for_period(db, uid, year_start,  today, cash_ids)

    cat_breakdown = db.query(
        Category.name, func.sum(Transaction.amount).label("total")
    ).join(Transaction, Transaction.category_id == Category.id).filter(
        Transaction.user_id == uid, Transaction.type == "expense",
        Transaction.date >= month_start, Transaction.date <= today,
    ).group_by(Category.id, Category.name).all()

    return {
        "net_worth":     net_worth,
        "cash_total":    cash_total,
        "bank_total":    bank_total,
        "savings_total": savings_total,
        "plot_total":    plot_total,
        "today": {"opening_cash": current_cash + today_out, "out": today_out, "current_cash": current_cash},
        "month": {"opening_cash": current_cash + month_out, "out": month_out, "current_cash": current_cash},
        "year":  {"opening_cash": current_cash + year_out,  "out": year_out,  "current_cash": current_cash},
        "category_breakdown": [{"name": r.name, "total": float(r.total)} for r in cat_breakdown],
        "accounts": [serialize_account(a) for a in accounts],
    }


@router.get("/category-summary")
def category_summary(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = db.query(Category).filter(
        Category.id == category_id, Category.user_id == current_user.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    income_total = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user.id,
        Transaction.category_id == category_id,
        Transaction.type == 'income',
    ).scalar()

    expense_total = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == current_user.id,
        Transaction.category_id == category_id,
        Transaction.type == 'expense',
    ).scalar()

    income_total = float(income_total or 0)
    expense_total = float(expense_total or 0)

    return {
        "category_id": category.id,
        "category_name": category.name,
        "total_income": income_total,
        "total_expense": expense_total,
        "net": income_total - expense_total,
    }


@reports_router.get("/")
def get_report(
    period: str = Query("monthly", regex="^(daily|monthly|yearly)$"),
    year: Optional[int] = None,
    month: Optional[int] = None,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid   = current_user.id
    today = date.today()
    year  = year  or today.year
    month = month or today.month

    if period == "daily":
        start = date(year, month, 1)
        end   = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
    elif period == "monthly":
        start = date(year, 1, 1)
        end   = date(year + 1, 1, 1)
    else:
        start = date(2000, 1, 1)
        end   = date(2100, 1, 1)

    base_filter = [Transaction.user_id == uid, Transaction.date >= start, Transaction.date < end]
    if account_id:
        base_filter.append((Transaction.from_account_id == account_id) | (Transaction.to_account_id == account_id))

    txns = db.query(Transaction).filter(*base_filter).order_by(Transaction.date, Transaction.created_at).all()

    rows = [{
        "period":       t.date.isoformat(),
        "type":         t.type,
        "amount":       float(t.amount),
        "income":       float(t.amount) if t.type == "income"   else 0.0,
        "expense":      float(t.amount) if t.type == "expense"  else 0.0,
        "transfer":     float(t.amount) if t.type == "transfer" else 0.0,
        "net":          float(t.amount) if t.type == "income" else (-float(t.amount) if t.type == "expense" else 0.0),
        "category":     t.category.name if t.category else "—",
        "note":         t.note or "—",
        "from_account": t.from_account.name if t.from_account else "—",
        "to_account":   t.to_account.name   if t.to_account   else "—",
    } for t in txns]

    accounts = db.query(Account).filter(Account.user_id == uid).all()
    return {
        "period": period,
        "rows": rows,
        "accounts": [serialize_account(a) for a in accounts],
    }