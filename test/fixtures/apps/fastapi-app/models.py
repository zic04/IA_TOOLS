# Fixture: SQLAlchemy models, for the `db` facts source.
import os
from sqlalchemy import Column, String, Numeric
from sqlalchemy.orm import Mapped, mapped_column, declarative_base

Base = declarative_base()
SECRET_KEY = os.getenv("SECRET_KEY")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    status = Column(String)
    amount = Column(Numeric)
