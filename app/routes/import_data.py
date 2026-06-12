import io
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
import openpyxl
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Account, Category, Transaction, User

router = APIRouter(prefix="/api/import", tags=["import"])


def parse_date(value):
    """Parse date from datetime object or common string formats."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        v = value.strip()
        for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y"):
            try:
                return datetime.strptime(v, fmt).date()
            except ValueError:
                continue
    return None


def to_amount(value):
    """Convert a cell value to a positive Decimal, or None if not a valid amount."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip().replace(",", "")
        if not v:
            return None
        try:
            value = float(v)
        except ValueError:
            return None
    try:
        amt = Decimal(str(value))
    except Exception:
        return None
    if amt <= 0:
        return None
    return amt


SKIP_LABELS = {"total", "date", "details", "remarks", "in", "out", "balance", "-", None}


@router.post("/preview")
def preview_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    try:
        content = file.file.read()
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel file: {e}")

    rows = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            if len(row) < 6:
                continue

            b, c, d, e, f = row[1], row[2], row[3], row[4], row[5]

            label = str(c).strip().lower() if isinstance(c, str) else c
            if label in SKIP_LABELS:
                continue

            parsed_date = parse_date(b)
            if parsed_date is None:
                continue

            details = str(c).strip()
            note = str(d).strip() if d else ""
            in_amt = to_amount(e)
            out_amt = to_amount(f)

            if in_amt is None and out_amt is None:
                continue

            if in_amt is not None:
                rows.append({
                    "date": parsed_date.isoformat(),
                    "type": "income",
                    "amount": float(in_amt),
                    "category_name": details,
                    "note": note,
                })
            if out_amt is not None:
                rows.append({
                    "date": parsed_date.isoformat(),
                    "type": "expense",
                    "amount": float(out_amt),
                    "category_name": details,
                    "note": note,
                })

    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    categories = db.query(Category).filter(Category.user_id == current_user.id).all()

    return {
        "rows": rows,
        "accounts": [
            {"id": a.id, "name": a.name, "type": a.type, "balance": float(a.balance)}
            for a in accounts
        ],
        "categories": [
            {"id": c.id, "name": c.name, "type": c.type}
            for c in categories
        ],
    }


class ImportTxnItem(BaseModel):
    date: date
    type: str                              # "income" / "expense" / "transfer"
    amount: Decimal
    category_name: Optional[str] = None    # required for income/expense
    category_type: Optional[str] = None    # used only if category is new
    account_id: int                        # to_account (income) / from_account (expense, transfer)
    to_account_id: Optional[int] = None    # required for transfer
    note: Optional[str] = None


class CommitRequest(BaseModel):
    transactions: List[ImportTxnItem]


@router.post("/commit")
def commit_import(
    payload: CommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.transactions:
        raise HTTPException(status_code=400, detail="No transactions to import")

    accounts = {
        a.id: a for a in db.query(Account).filter(Account.user_id == current_user.id).all()
    }
    categories = {
        c.name: c for c in db.query(Category).filter(Category.user_id == current_user.id).all()
    }

    created_count = 0
    categories_created = 0
    min_date, max_date = None, None
    affected_accounts = {}

    try:
        for item in payload.transactions:
            if item.type not in ("income", "expense", "transfer"):
                raise HTTPException(status_code=400, detail=f"Invalid type: {item.type}")
            if item.amount <= 0:
                raise HTTPException(status_code=400, detail="Amount must be positive")

            account = accounts.get(item.account_id)
            if not account:
                raise HTTPException(status_code=404, detail=f"Account {item.account_id} not found")

            if item.date and (min_date is None or item.date < min_date):
                min_date = item.date
            if item.date and (max_date is None or item.date > max_date):
                max_date = item.date

            # ---- Transfer ----
            if item.type == "transfer":
                if not item.to_account_id:
                    raise HTTPException(status_code=400, detail="Destination account is required for transfer")
                to_account = accounts.get(item.to_account_id)
                if not to_account:
                    raise HTTPException(status_code=404, detail=f"Account {item.to_account_id} not found")
                if to_account.id == account.id:
                    raise HTTPException(status_code=400, detail="From and To accounts must differ")

                txn = Transaction(
                    user_id=current_user.id,
                    date=item.date,
                    type="transfer",
                    amount=item.amount,
                    category_id=None,
                    from_account_id=account.id,
                    to_account_id=to_account.id,
                    note=item.note,
                )
                db.add(txn)
                account.balance -= item.amount
                to_account.balance += item.amount

                affected_accounts[account.id] = account
                affected_accounts[to_account.id] = to_account
                created_count += 1
                continue

            # ---- Income / Expense ----
            name = (item.category_name or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Category name cannot be empty")

            category = categories.get(name)
            if category is None:
                cat_type = item.category_type if item.category_type in ("income", "expense", "both") else item.type
                category = Category(name=name, type=cat_type, user_id=current_user.id)
                db.add(category)
                db.flush()
                categories[name] = category
                categories_created += 1
            elif category.type != "both" and category.type != item.type:
                category.type = "both"

            txn = Transaction(
                user_id=current_user.id,
                date=item.date,
                type=item.type,
                amount=item.amount,
                category_id=category.id,
                to_account_id=account.id if item.type == "income" else None,
                from_account_id=account.id if item.type == "expense" else None,
                note=item.note,
            )
            db.add(txn)

            if item.type == "income":
                account.balance += item.amount
            else:
                account.balance -= item.amount

            affected_accounts[account.id] = account
            created_count += 1

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {e}")

    return {
        "message": f"Import successful — {created_count} transaction(s) created.",
        "transactions_created": created_count,
        "categories_created": categories_created,
        "date_range": {
            "start": min_date.isoformat() if min_date else None,
            "end": max_date.isoformat() if max_date else None,
        },
        "accounts": [
            {"id": a.id, "name": a.name, "balance": float(a.balance)}
            for a in affected_accounts.values()
        ],
    }