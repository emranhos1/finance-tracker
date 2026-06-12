from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Category, User

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    type: str


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None


@router.get("/")
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cats = db.query(Category).filter(Category.user_id == current_user.id).order_by(Category.type, Category.name).all()
    return [{"id": c.id, "name": c.name, "type": c.type} for c in cats]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.type not in ("income", "expense", "both"):
        raise HTTPException(status_code=400, detail="Type must be income, expense, or both")
    existing = db.query(Category).filter(
        Category.user_id == current_user.id,
        Category.name == payload.name,
        Category.type == payload.type
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = Category(name=payload.name, type=payload.type, user_id=current_user.id)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "message": "Category created"}


@router.put("/{cat_id}")
def update_category(cat_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.type and payload.type not in ("income", "expense", "both"):
        raise HTTPException(status_code=400, detail="Type must be income, expense, or both")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    db.commit()
    return {"message": "Category updated"}


@router.delete("/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"message": "Category deleted"}