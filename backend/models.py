from sqlalchemy import Column, Integer, String, Numeric, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime, timezone

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)  # Simple auth for prototype
    role = Column(String)      # salesman, admin, production, auditor, owner

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    type = Column(String)      # retailer, distributor
    state = Column(String)     # Tamil Nadu, Karnataka (GST logic-ku)
    gstin = Column(String, nullable=True)

class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    category = Column(String)  # raw, packaging, finished
    unit = Column(String)      # kg, litre, piece, packet
    selling_price = Column(Numeric(12, 2), default=0)
    hsn_code = Column(String, nullable=True)
    gst_rate = Column(Numeric(5, 2), default=5.00)

class BOM(Base):
    __tablename__ = "bom"
    id = Column(Integer, primary_key=True, index=True)
    finished_item_id = Column(Integer, ForeignKey("items.id"))
    raw_item_id = Column(Integer, ForeignKey("items.id"))
    qty_per_batch = Column(Numeric(12, 3))
    expected_yield = Column(Numeric(12, 3)) # e.g., 200 packets

class StockLedger(Base):
    __tablename__ = "stock_ledger"
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"))
    qty_change = Column(Numeric(12, 3))    # + for receipt/output, - for issue/sale
    unit_cost = Column(Numeric(12, 2), default=0)
    source_type = Column(String)           # opening, purchase, production_issue, production_output, wastage, sale
    source_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ProductionRun(Base):
    __tablename__ = "production_runs"
    id = Column(Integer, primary_key=True, index=True)
    finished_item_id = Column(Integer, ForeignKey("items.id"))
    expected_qty = Column(Numeric(12, 3))
    actual_qty = Column(Numeric(12, 3))
    damaged_pouches = Column(Numeric(12, 3), default=0)
    cartons_used = Column(Numeric(12, 3), default=0)
    labour_cost = Column(Numeric(12, 2), default=0)
    overhead_cost = Column(Numeric(12, 2), default=0)
    yield_variance_pct = Column(Numeric(6, 2), default=0)
    is_flagged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    salesman_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="submitted") # submitted, approved, invoiced, dispatched
    taxable_amount = Column(Numeric(12, 2), default=0)
    cgst = Column(Numeric(12, 2), default=0)
    sgst = Column(Numeric(12, 2), default=0)
    igst = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(12, 2), default=0)
    invoice_number = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    item_id = Column(Integer, ForeignKey("items.id"))
    qty = Column(Numeric(12, 3))
    unit_price = Column(Numeric(12, 2))

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    customer_id = Column(Integer, ForeignKey("customers.id"))
    amount = Column(Numeric(12, 2))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
