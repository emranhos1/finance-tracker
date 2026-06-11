from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date, datetime
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Transaction, Account, Category

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
reports_router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), _=Depends(get_current_user)):
    today = date.today()
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)

    # Net worth = sum of all account balances
    net_worth = db.query(func.coalesce(func.sum(Account.balance), 0)).scalar()

    def period_totals(start: date, end: date):
        income = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date <= end,
        ).scalar()
        expense = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        ).scalar()
        return float(income), float(expense)

    today_income, today_expense = period_totals(today, today)
    month_income, month_expense = period_totals(month_start, today)
    year_income, year_expense = period_totals(year_start, today)

    # Category breakdown for current month (expenses)
    cat_breakdown = db.query(
        Category.name,
        func.sum(Transaction.amount).label("total")
    ).join(Transaction, Transaction.category_id == Category.id).filter(
        Transaction.type == "expense",
        Transaction.date >= month_start,
        Transaction.date <= today,
    ).group_by(Category.id, Category.name).all()

    # Account balances
    accounts = db.query(Account).all()

    return {
        "net_worth": float(net_worth),
        "today": {"income": today_income, "expense": today_expense, "net": today_income - today_expense},
        "month": {"income": month_income, "expense": month_expense, "net": month_income - month_expense},
        "year": {"income": year_income, "expense": year_expense, "net": year_income - year_expense},
        "category_breakdown": [{"name": r.name, "total": float(r.total)} for r in cat_breakdown],
        "accounts": [
            {"id": a.id, "name": a.name, "type": a.type, "balance": float(a.balance)}
            for a in accounts
        ],
    }


@reports_router.get("/")
def get_report(
    period: str = Query("monthly", regex="^(daily|monthly|yearly)$"),
    year: Optional[int] = None,
    month: Optional[int] = None,
    account_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    today = date.today()
    year = year or today.year
    month = month or today.month

    if period == "daily":
        start = date(year, month, 1)
        end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
        # Group by day
        group_col = func.date(Transaction.date)
    elif period == "monthly":
        start = date(year, 1, 1)
        end = date(year + 1, 1, 1)
        group_col = func.date_format(Transaction.date, "%Y-%m")
    else:  # yearly
        start = date(2000, 1, 1)
        end = date(2100, 1, 1)
        group_col = func.year(Transaction.date)

    base_filter = [Transaction.date >= start, Transaction.date < end]
    if account_id:
        base_filter.append(
            (Transaction.from_account_id == account_id) | (Transaction.to_account_id == account_id)
        )

    income_rows = db.query(group_col.label("period"), func.sum(Transaction.amount).label("total")).filter(
        *base_filter, Transaction.type == "income"
    ).group_by(group_col).all()

    expense_rows = db.query(group_col.label("period"), func.sum(Transaction.amount).label("total")).filter(
        *base_filter, Transaction.type == "expense"
    ).group_by(group_col).all()

    income_map = {str(r.period): float(r.total) for r in income_rows}
    expense_map = {str(r.period): float(r.total) for r in expense_rows}
    all_periods = sorted(set(list(income_map.keys()) + list(expense_map.keys())))

    rows = [
        {
            "period": p,
            "income": income_map.get(p, 0.0),
            "expense": expense_map.get(p, 0.0),
            "net": income_map.get(p, 0.0) - expense_map.get(p, 0.0),
        }
        for p in all_periods
    ]

    # Per-account balance snapshot
    account_balances = db.query(Account).all()

    return {
        "rows": rows,
        "accounts": [
            {"id": a.id, "name": a.name, "type": a.type, "balance": float(a.balance)}
            for a in account_balances
        ],
    }
