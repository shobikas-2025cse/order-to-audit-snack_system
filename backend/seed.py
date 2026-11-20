from decimal import Decimal
from database import engine, SessionLocal
from models import Base, User, Customer, Item, BOM, StockLedger

def seed_data():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Skips if already seeded (checks if any Item exists)
    if db.query(Item).first():
        print("Database already seeded!")
        db.close()
        return

    # 1. Users (Login roles)
    users = [
        User(username="salesman_a", password="123", role="salesman"),
        User(username="salesman_b", password="123", role="salesman"),
        User(username="admin", password="123", role="admin"),
        User(username="production", password="123", role="production"),
        User(username="auditor", password="123", role="auditor"),
        User(username="owner", password="123", role="owner"),
    ]
    db.add_all(users)

    # 2. Customers (TN -> CGST+SGST, Karnataka -> IGST)
    customers = [
        Customer(name="Retailer A", type="retailer", state="Tamil Nadu", gstin="33AAAAA0000A1Z5"),
        Customer(name="Distributor B", type="distributor", state="Karnataka", gstin="29BBBBB0000B1Z5"),
    ]
    db.add_all(customers)

    # 3. Items (Raw, Packaging, Finished)
    flour = Item(name="Flour", category="raw", unit="kg")
    oil = Item(name="Cooking oil", category="raw", unit="litre")
    spice = Item(name="Salt and spice mix", category="raw", unit="kg")
    pouch = Item(name="200 g pouch", category="packaging", unit="piece")
    carton = Item(name="Carton", category="packaging", unit="piece")
    murukku = Item(
        name="Murukku 200 g",
        category="finished",
        unit="packet",
        selling_price=Decimal("50.00"),
        hsn_code="21069099",
        gst_rate=Decimal("5.00"),
    )

    db.add_all([flour, oil, spice, pouch, carton, murukku])
    db.commit()  # Commit to generate Item IDs

    # 4. BOM (1 Batch = 200 packets expected)
    bom_items = [
        BOM(finished_item_id=murukku.id, raw_item_id=flour.id, qty_per_batch=Decimal("40.000"), expected_yield=Decimal("200.000")),
        BOM(finished_item_id=murukku.id, raw_item_id=oil.id, qty_per_batch=Decimal("10.000"), expected_yield=Decimal("200.000")),
        BOM(finished_item_id=murukku.id, raw_item_id=spice.id, qty_per_batch=Decimal("1.200"), expected_yield=Decimal("200.000")),
        BOM(finished_item_id=murukku.id, raw_item_id=pouch.id, qty_per_batch=Decimal("200.000"), expected_yield=Decimal("200.000")),
        BOM(finished_item_id=murukku.id, raw_item_id=carton.id, qty_per_batch=Decimal("10.000"), expected_yield=Decimal("200.000")),
    ]
    db.add_all(bom_items)

    # 5. Opening Stock in StockLedger
    opening_stock = [
        StockLedger(item_id=flour.id, qty_change=Decimal("100.000"), unit_cost=Decimal("42.00"), source_type="opening"),
        StockLedger(item_id=oil.id, qty_change=Decimal("30.000"), unit_cost=Decimal("140.00"), source_type="opening"),
        StockLedger(item_id=spice.id, qty_change=Decimal("5.000"), unit_cost=Decimal("200.00"), source_type="opening"),
        StockLedger(item_id=pouch.id, qty_change=Decimal("500.000"), unit_cost=Decimal("2.50"), source_type="opening"),
        StockLedger(item_id=carton.id, qty_change=Decimal("30.000"), unit_cost=Decimal("15.00"), source_type="opening"),
        StockLedger(item_id=murukku.id, qty_change=Decimal("50.000"), unit_cost=Decimal("0.00"), source_type="opening"),
    ]
    db.add_all(opening_stock)
    db.commit()
    db.close()
    print("Benchmark master data seeded successfully!")

if __name__ == "__main__":
    seed_data()
