import os
from dotenv import load_dotenv
load_dotenv()
from security import (
    create_access_token,
    verify_password,
    hash_password
)
from security import require_roles, create_access_token, get_current_user
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from decimal import Decimal
from typing import List, Optional
from firebase_auth import get_current_erp_user, require_firebase_roles
from database import get_db, engine
from models import Base, User, Customer, Item, BOM, StockLedger, ProductionRun, Order, OrderItem, Payment
Base.metadata.create_all(bind=engine)
from seed import seed_data
seed_data()

app = FastAPI(title="Order-to-Audit Snack ERP")
@app.get("/api/auth/me")
def firebase_me(
    current_user: User = Depends(get_current_erp_user)
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role
    }
# to connect react frontend we enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class LoginReq(BaseModel):
    username: str
    password: str

class PurchaseReq(BaseModel):
    item_id: int
    qty: Decimal
    unit_cost: Decimal

class ProductionReq(BaseModel):
    finished_item_id: int
    flour_qty: Decimal
    oil_qty: Decimal
    spice_qty: Decimal
    actual_packets: Decimal
    damaged_pouches: Decimal
    cartons_used: Decimal
    labour_cost: Decimal = Decimal("0")
    overhead_cost: Decimal = Decimal("0")

class OrderItemReq(BaseModel):
    item_id: int
    qty: Decimal

class OrderReq(BaseModel):
    customer_id: int
    salesman_id: int
    items: List[OrderItemReq]

class PaymentReq(BaseModel):
    order_id: int
    amount: Decimal

# --- Helper Functions ---
def get_stock_balance(db: Session, item_id: int) -> Decimal:
    total = db.query(func.sum(StockLedger.qty_change)).filter(StockLedger.item_id == item_id).scalar()
    return Decimal(total) if total else Decimal("0.000")

def get_weighted_avg_cost(db: Session, item_id: int) -> Decimal:
    entries = db.query(StockLedger).filter(
        StockLedger.item_id == item_id,
        StockLedger.source_type.in_(["opening", "purchase"])
    ).all()
    total_qty = sum((Decimal(e.qty_change) for e in entries), Decimal("0"))
    total_val = sum((Decimal(e.qty_change) * Decimal(e.unit_cost) for e in entries), Decimal("0"))
    return (total_val / total_qty) if total_qty > 0 else Decimal("0")

# --- Endpoints ---

@app.post("/api/login")
def login(req: LoginReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.username == req.username
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    # Support old plaintext passwords during migration
    if user.password.startswith("pbkdf2_sha256$"):
        if not verify_password(req.password, user.password):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )
    else:
        if user.password != req.password:
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )

        # Upgrade old password to hashed password
        user.password = hash_password(req.password)
        db.commit()

    token = create_access_token(user)

    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "access_token": token,
        "token_type": "bearer"
    }


@app.get("/api/master-data")
def get_master_data(
    current_user: User = Depends(
        require_firebase_roles(
            "salesman",
            "production",
            "admin",
            "auditor",
            "owner"
        )
    ),
    db: Session = Depends(get_db)
):
    items = db.query(Item).all()
    stock_list = [
        {
            "id": i.id,
            "name": i.name,
            "category": i.category,
            "unit": i.unit,
            "selling_price": float(i.selling_price),
            "balance": float(get_stock_balance(db, i.id))
        }
        for i in items
    ]
    return {
        "items": stock_list,
        "customers": db.query(Customer).all(),
        "boms": db.query(BOM).all()
    }


@app.post("/api/purchases")
def record_purchase(
    req: PurchaseReq,
    current_user: User = Depends(
        require_firebase_roles("admin", "owner")
    ),
    db: Session = Depends(get_db)
):
    entry = StockLedger(
        item_id=req.item_id,
        qty_change=req.qty,
        unit_cost=req.unit_cost,
        source_type="purchase"
    )

    db.add(entry)
    db.commit()

    return {
        "message": "Purchase recorded",
        "new_balance": float(get_stock_balance(db, req.item_id))
    }


@app.post("/api/production")
def record_production(
    req: ProductionReq,
    current_user: User = Depends(
        require_firebase_roles("production")
    ),
    db: Session = Depends(get_db)
):
    items = {i.name: i for i in db.query(Item).all()}
    expected_yield = Decimal("200.000")

    yield_var_pct = (
        (req.actual_packets - expected_yield) / expected_yield
    ) * Decimal("100")

    oil_var_pct = (
        (req.oil_qty - Decimal("10.000")) / Decimal("10.000")
    ) * Decimal("100")

    is_flagged = (
        abs(yield_var_pct) > Decimal("3.0")
        or abs(oil_var_pct) > Decimal("3.0")
    )

    run = ProductionRun(
        finished_item_id=req.finished_item_id,
        expected_qty=expected_yield,
        actual_qty=req.actual_packets,
        damaged_pouches=req.damaged_pouches,
        cartons_used=req.cartons_used,
        labour_cost=req.labour_cost,
        overhead_cost=req.overhead_cost,
        yield_variance_pct=round(yield_var_pct, 2),
        is_flagged=is_flagged
    )

    db.add(run)
    db.commit()
    db.refresh(run)

    total_pouches = req.actual_packets + req.damaged_pouches

    movements = [
        StockLedger(item_id=items["Flour"].id, qty_change=-req.flour_qty, source_type="production_issue", source_id=run.id),
        StockLedger(item_id=items["Cooking oil"].id, qty_change=-req.oil_qty, source_type="production_issue", source_id=run.id),
        StockLedger(item_id=items["Salt and spice mix"].id, qty_change=-req.spice_qty, source_type="production_issue", source_id=run.id),
        StockLedger(item_id=items["200 g pouch"].id, qty_change=-total_pouches, source_type="production_issue", source_id=run.id),
        StockLedger(item_id=items["Carton"].id, qty_change=-req.cartons_used, source_type="production_issue", source_id=run.id),
        StockLedger(item_id=req.finished_item_id, qty_change=req.actual_packets, source_type="production_output", source_id=run.id),
    ]

    db.add_all(movements)
    db.commit()

    mat_cost = (
        req.flour_qty * get_weighted_avg_cost(db, items["Flour"].id) +
        req.oil_qty * get_weighted_avg_cost(db, items["Cooking oil"].id) +
        req.spice_qty * get_weighted_avg_cost(db, items["Salt and spice mix"].id) +
        total_pouches * get_weighted_avg_cost(db, items["200 g pouch"].id) +
        req.cartons_used * get_weighted_avg_cost(db, items["Carton"].id)
    )

    total_cost = mat_cost + req.labour_cost + req.overhead_cost

    cost_per_packet = (
        round(total_cost / req.actual_packets, 2)
        if req.actual_packets > 0
        else Decimal("0")
    )

    return {
        "run_id": run.id,
        "yield_variance_pct": float(round(yield_var_pct, 2)),
        "oil_variance_pct": float(round(oil_var_pct, 2)),
        "flagged": is_flagged,
        "cost_per_packet": float(cost_per_packet)
    }



@app.post("/api/orders")
def create_order(
    req: OrderReq,
    current_user: User = Depends(
        require_firebase_roles("salesman")
    ),
    db: Session = Depends(get_db)
):
    order = Order(
        customer_id=req.customer_id,
        salesman_id=current_user.id,
        status="submitted"
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    taxable = Decimal("0")

    for line in req.items:
        item = db.query(Item).filter(
            Item.id == line.item_id
        ).first()

        if not item:
            raise HTTPException(
                status_code=404,
                detail=f"Item {line.item_id} not found"
            )

        oi = OrderItem(
            order_id=order.id,
            item_id=item.id,
            qty=line.qty,
            unit_price=item.selling_price
        )

        taxable += line.qty * Decimal(item.selling_price)
        db.add(oi)

    order.taxable_amount = taxable
    db.commit()

    return {
        "order_id": order.id,
        "status": order.status,
        "taxable_amount": float(taxable)
    }


@app.get("/api/orders")
def list_orders(
    current_user: User = Depends(
        require_firebase_roles("admin", "auditor", "owner")
    ),
    db: Session = Depends(get_db)
):
    orders = db.query(Order).all()
    result = []

    for o in orders:
        cust = db.query(Customer).filter(
            Customer.id == o.customer_id
        ).first()

        items = db.query(OrderItem).filter(
            OrderItem.order_id == o.id
        ).all()

        shortage = Decimal("0")

        for oi in items:
            avail = get_stock_balance(db, oi.item_id)
            if Decimal(oi.qty) > avail:
                shortage = Decimal(oi.qty) - avail

        paid = (
            db.query(func.sum(Payment.amount))
            .filter(Payment.order_id == o.id)
            .scalar() or Decimal("0")
        )

        result.append({
            "id": o.id,
            "customer_name": cust.name if cust else None,
            "customer_state": cust.state if cust else None,
            "status": o.status,
            "taxable_amount": float(o.taxable_amount),
            "cgst": float(o.cgst),
            "sgst": float(o.sgst),
            "igst": float(o.igst),
            "total_amount": float(o.total_amount),
            "paid_amount": float(paid),
            "outstanding": float(Decimal(o.total_amount) - Decimal(paid)),
            "invoice_number": o.invoice_number,
            "stock_shortage": float(shortage),
            "items": [
                {"item_id": i.item_id, "qty": float(i.qty)}
                for i in items
            ]
        })

    return result



@app.post("/api/orders/{order_id}/approve-dispatch")
def approve_and_dispatch(
    order_id: int,
    current_user: User = Depends(
        require_firebase_roles("admin", "owner")
    ),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    cust = db.query(Customer).filter(
        Customer.id == order.customer_id
    ).first()

    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    items = db.query(OrderItem).filter(
        OrderItem.order_id == order.id
    ).all()

    for oi in items:
        avail = get_stock_balance(db, oi.item_id)

        if Decimal(oi.qty) > avail:
            shortage = Decimal(oi.qty) - avail
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock! Shortage of {shortage} packets."
            )

    taxable = Decimal(order.taxable_amount)
    gst_amount = taxable * Decimal("0.05")

    if cust.state.lower() == "tamil nadu":
        order.cgst = round(gst_amount / 2, 2)
        order.sgst = round(gst_amount / 2, 2)
        order.igst = Decimal("0.00")
    else:
        order.cgst = Decimal("0.00")
        order.sgst = Decimal("0.00")
        order.igst = round(gst_amount, 2)

    order.total_amount = (
        taxable + order.cgst + order.sgst + order.igst
    )

    order.status = "dispatched"
    order.invoice_number = f"INV-2627-{order.id:04d}"

    for oi in items:
        db.add(
            StockLedger(
                item_id=oi.item_id,
                qty_change=-oi.qty,
                source_type="sale",
                source_id=order.id
            )
        )

    db.commit()

    return {
        "message": "Invoiced & Dispatched",
        "invoice_number": order.invoice_number,
        "total": float(order.total_amount)
    }


@app.post("/api/payments")
def record_payment(
    req: PaymentReq,
    current_user: User = Depends(
        require_firebase_roles("admin", "owner")
    ),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == req.order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    pmt = Payment(
        order_id=order.id,
        customer_id=order.customer_id,
        amount=req.amount
    )

    db.add(pmt)
    db.commit()

    return {"message": "Payment recorded"}



@app.get("/api/ledger")
def get_stock_ledger(
    current_user: User = Depends(
        require_firebase_roles(
            "production",
            "auditor",
            "owner"
        )
    ),
    db: Session = Depends(get_db)
):
    entries = db.query(StockLedger).order_by(
        StockLedger.id.desc()
    ).all()

    items = {
        i.id: i.name
        for i in db.query(Item).all()
    }

    return [
        {
            "id": e.id,
            "item": items.get(e.item_id),
            "qty_change": float(e.qty_change),
            "unit_cost": float(e.unit_cost),
            "source_type": e.source_type,
            "source_id": e.source_id,
            "created_at": e.created_at.isoformat()
        }
        for e in entries
   ]    

@app.post("/api/reset-benchmark")
def reset_benchmark(
    current_user: User = Depends(
        require_firebase_roles("admin")
    ),
    db: Session = Depends(get_db)
):
    if os.getenv("ENABLE_BENCHMARK_RESET", "false").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail="Benchmark reset is disabled in this environment."
        )


    try:
        # Reset only the benchmark's transactional records.
        # Do not drop the entire database or recreate the schema.
        db.query(Payment).delete(synchronize_session=False)
        db.query(OrderItem).delete(synchronize_session=False)
        db.query(Order).delete(synchronize_session=False)
        db.query(ProductionRun).delete(synchronize_session=False)

        db.query(StockLedger).filter(
            StockLedger.source_type != "opening"
        ).delete(synchronize_session=False)

        db.commit()

        return {
            "message": "Benchmark transactions reset successfully."
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Benchmark reset failed."
        )


@app.get("/api/audit-summary")
def get_audit_summary(
    current_user: User = Depends(
        require_firebase_roles("auditor", "owner")
    ),
    db: Session = Depends(get_db)
):
    orders = db.query(Order).filter(
        Order.status == "dispatched"
    ).all()

    total_taxable = sum(
        (Decimal(o.taxable_amount) for o in orders),
        Decimal("0")
    )

    total_revenue = total_taxable

    total_cgst = sum(
        (Decimal(o.cgst) for o in orders),
        Decimal("0")
    )

    total_sgst = sum(
        (Decimal(o.sgst) for o in orders),
        Decimal("0")
    )

    total_igst = sum(
        (Decimal(o.igst) for o in orders),
        Decimal("0")
    )

    flagged_runs = (
        db.query(func.count(ProductionRun.id))
        .filter(ProductionRun.is_flagged.is_(True))
        .scalar() or 0
    )

    shortage_orders = 0

    for order in db.query(Order).filter(
        Order.status == "submitted"
    ).all():

        items = db.query(OrderItem).filter(
            OrderItem.order_id == order.id
        ).all()

        if any(
            Decimal(item.qty) > get_stock_balance(db, item.item_id)
            for item in items
        ):
            shortage_orders += 1

    customers = db.query(Customer).all()
    cust_summary = []

    for c in customers:
        billed = sum(
            (
                Decimal(o.total_amount)
                for o in orders
                if o.customer_id == c.id
            ),
            Decimal("0")
        )

        paid = (
            db.query(func.sum(Payment.amount))
            .filter(Payment.customer_id == c.id)
            .scalar() or Decimal("0")
        )

        cust_summary.append({
            "name": c.name,
            "state": c.state,
            "total_billed": float(billed),
            "total_paid": float(paid),
            "outstanding": float(billed - Decimal(paid))
        })

    return {
        "total_revenue": float(total_revenue),
        "active_alerts": flagged_runs + shortage_orders,
        "alerts": {
            "flagged_runs": flagged_runs,
            "shortage_orders": shortage_orders
        },
        "gst": {
            "taxable": float(total_taxable),
            "cgst": float(total_cgst),
            "sgst": float(total_sgst),
            "igst": float(total_igst),
            "total_tax": float(total_cgst + total_sgst + total_igst)
        },
        "customers": cust_summary
    }

