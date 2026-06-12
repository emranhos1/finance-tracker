from sqlalchemy import Column, Integer, String, Numeric, Date, Text, Enum, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    username        = Column(String(50), nullable=False, unique=True)
    email           = Column(String(100), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(Enum("admin", "user"), nullable=False, default="user")
    is_active       = Column(Boolean, nullable=False, default=False)
    created_at      = Column(TIMESTAMP, server_default=func.now())

    accounts     = relationship("Account",     back_populates="user", cascade="all, delete")
    categories   = relationship("Category",   back_populates="user", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(100), nullable=False, unique=True)
    expires_at = Column(TIMESTAMP, nullable=False)
    used       = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User")


class Account(Base):
    __tablename__ = "accounts"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name               = Column(String(100), nullable=False)
    type               = Column(Enum("cash", "bank", "dps", "fdr", "plot"), nullable=False)
    balance            = Column(Numeric(15, 2), nullable=False, default=0.00)
    starting_date      = Column(Date, nullable=True)
    maturity_date      = Column(Date, nullable=True)
    account_number     = Column(String(50), nullable=True)
    installment_amount = Column(Numeric(15, 2), nullable=True)
    created_at         = Column(TIMESTAMP, server_default=func.now())

    user              = relationship("User", back_populates="accounts")
    transactions_from = relationship("Transaction", foreign_keys="Transaction.from_account_id", back_populates="from_account")
    transactions_to   = relationship("Transaction", foreign_keys="Transaction.to_account_id",   back_populates="to_account")


class Category(Base):
    __tablename__ = "categories"

    id      = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name    = Column(String(100), nullable=False)
    type    = Column(Enum("income", "expense", "both"), nullable=False)

    user         = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")


class Transaction(Base):
    __tablename__ = "transactions"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date            = Column(Date, nullable=False)
    type            = Column(Enum("income", "expense", "transfer"), nullable=False)
    amount          = Column(Numeric(15, 2), nullable=False)
    category_id     = Column(Integer, ForeignKey("categories.id",    ondelete="SET NULL"), nullable=True)
    from_account_id = Column(Integer, ForeignKey("accounts.id",      ondelete="SET NULL"), nullable=True)
    to_account_id   = Column(Integer, ForeignKey("accounts.id",      ondelete="SET NULL"), nullable=True)
    note            = Column(Text, nullable=True)
    created_at      = Column(TIMESTAMP, server_default=func.now())

    user         = relationship("User",     back_populates="transactions")
    category     = relationship("Category", back_populates="transactions")
    from_account = relationship("Account",  foreign_keys=[from_account_id], back_populates="transactions_from")
    to_account   = relationship("Account",  foreign_keys=[to_account_id],   back_populates="transactions_to")