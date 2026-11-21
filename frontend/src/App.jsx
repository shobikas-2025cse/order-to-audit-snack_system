import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Factory, ShoppingCart, FileText, BarChart3, AlertTriangle, CheckCircle, Download, LogOut, X } from "lucide-react";

// const API = (import.meta.env.VITE_API_URL
//   || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
//     ? "http://127.0.0.1:8000/api"
//     : "/api")).replace(/\/$/, "");
const API = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:8000/api"
  : "https://snack-erp-backend.onrender.com/api";


export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [master, setMaster] = useState({ items: [], customers: [], boms: [] });
  const [orders, setOrders] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [purItem, setPurItem] = useState(1);
  const [purQty, setPurQty] = useState(60);
  const [purCost, setPurCost] = useState(45);

  const [prodForm, setProdForm] = useState({
    flour_qty: 40, oil_qty: 10.5, spice_qty: 1.2,
    actual_packets: 188, damaged_pouches: 6, cartons_used: 9,
    labour_cost: 1200, overhead_cost: 600
  });
  const [prodResult, setProdResult] = useState(null);

  const [orderCust, setOrderCust] = useState(1);
  const [orderQty, setOrderQty] = useState(150);
  const [payAmount, setPayAmount] = useState(4000);

  const loadAll = async () => {
    const [mRes, oRes, lRes] = await Promise.all([
      fetch(`${API}/master-data`).then(r => r.json()),
      fetch(`${API}/orders`).then(r => r.json()),
      fetch(`${API}/ledger`).then(r => r.json())
    ]);
    setMaster(mRes);
    setOrders(oRes);
    setLedger(lRes);
  };

  const quickLogin = async (username, defaultTab) => {
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "123" })
      });
      if (!res.ok) {
        showToast("Unable to connect to the server.", "error");
        return;
      }
      setUser(await res.json());
      setTab(defaultTab);
      await loadAll();
    } catch {
      showToast("Unable to connect to the server.", "error");
    }
  };

  const handlePurchase = async (e) => {
    e.preventDefault();
    await fetch(`${API}/purchases`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: Number(purItem), qty: Number(purQty), unit_cost: Number(purCost) })
    });
    showToast("Purchase recorded & Stock updated!", "success");
    loadAll();
  };

  const handleProduction = async (e) => {
    e.preventDefault();
    const murukku = master.items.find(i => i.category === "finished");
    const res = await fetch(`${API}/production`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finished_item_id: murukku.id, ...prodForm })
    });
    setProdResult(await res.json());
    loadAll();
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    const murukku = master.items.find(i => i.category === "finished");
    await fetch(`${API}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: Number(orderCust),
        salesman_id: user.id,
        items: [{ item_id: murukku.id, qty: Number(orderQty) }]
      })
    });
    showToast("Order submitted to factory!", "success");
    loadAll();
  };

  const handleDispatch = async (orderId) => {
    const res = await fetch(`${API}/orders/${orderId}/approve-dispatch`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) showToast(`Blocked: ${data.detail}`, "error");
    else {
      showToast(`Dispatched! Invoice: ${data.invoice_number}`, "success");
      loadAll();
    }
  };

  const handlePayment = async (orderId) => {
    await fetch(`${API}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, amount: Number(payAmount) })
    });
    showToast("Payment recorded!", "success");
    loadAll();
  };

  const downloadInvoicePDF = (o) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("SOUTH INDIAN SNACKS PVT LTD - TAX INVOICE", 14, 20);
    doc.setFontSize(10);
    doc.text("Factory GSTIN: 33AABCS1234F1Z5 (Tamil Nadu)", 14, 28);
    doc.text(`Invoice No: ${o.invoice_number} | Customer: ${o.customer_name} (${o.customer_state})`, 14, 35);

    autoTable(doc, {
      startY: 42,
      head: [["Product", "HSN", "Qty", "Rate", "Taxable", "CGST (2.5%)", "SGST (2.5%)", "IGST (5%)", "Total"]],
      body: [[
        "Murukku 200 g", "21069099", o.items?.[0]?.qty ?? 0, "50.00",
        o.taxable_amount.toFixed(2), o.cgst.toFixed(2), o.sgst.toFixed(2), o.igst.toFixed(2), o.total_amount.toFixed(2)
      ]]
    });
    doc.save(`${o.invoice_number}.pdf`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(master.items), "Stock_Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders), "Sales_GST_Register");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledger), "Stock_Ledger");
    XLSX.writeFile(wb, "Monthly_Auditor_Report.xlsx");
  };

  const toastNotification = toast && (
    <div
      role="alert"
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        toast.type === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {toast.type === "error"
        ? <AlertTriangle size={18} />
        : <CheckCircle size={18} />}
      <span className="flex-1 text-sm font-medium">{toast.msg}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="rounded p-1 hover:bg-black/5"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );

  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Murukku Factory ERP</h1>
            <p className="text-sm text-slate-500 mb-6">Order-to-Audit System (Select Role to Demo)</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => quickLogin("production", "production")} className="p-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700">Production Floor</button>
              <button onClick={() => quickLogin("salesman_a", "salesman")} className="p-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Salesman A (Mobile)</button>
              <button onClick={() => quickLogin("salesman_b", "salesman")} className="p-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Salesman B (Mobile)</button>
              <button onClick={() => quickLogin("admin", "admin")} className="p-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700">Factory Admin</button>
              <button onClick={() => quickLogin("auditor", "dashboard")} className="p-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-800 col-span-2">Auditor / Owner Reports</button>
            </div>
          </div>
        </div>
        {toastNotification}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <nav className="bg-slate-900 text-white px-4 py-3 flex flex-wrap justify-between items-center gap-2">
        <div className="font-bold text-lg flex items-center gap-2"><Factory size={20}/> SnackFactory ERP <span className="text-xs bg-slate-700 px-2 py-1 rounded uppercase">{user.username}</span></div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button onClick={() => setTab("dashboard")} className={`px-3 py-1 rounded ${tab==="dashboard"?"bg-amber-500 text-black font-bold":"hover:bg-slate-800"}`}>Stock & Reports</button>
          <button onClick={() => setTab("production")} className={`px-3 py-1 rounded ${tab==="production"?"bg-amber-500 text-black font-bold":"hover:bg-slate-800"}`}>Production & BOM</button>
          <button onClick={() => setTab("salesman")} className={`px-3 py-1 rounded ${tab==="salesman"?"bg-amber-500 text-black font-bold":"hover:bg-slate-800"}`}>Field Order</button>
          <button onClick={() => setTab("admin")} className={`px-3 py-1 rounded ${tab==="admin"?"bg-amber-500 text-black font-bold":"hover:bg-slate-800"}`}>GST Billing</button>
          <button onClick={() => setUser(null)} className="px-3 py-1 bg-red-600 rounded flex items-center gap-1"><LogOut size={14}/> Switch</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2"><BarChart3/> Live Stock & Auditor Reports</h2>
              <button onClick={exportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-emerald-700"><Download size={16}/> Export Excel (.xlsx)</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {master.items.map(i => (
                <div key={i.id} className="bg-white p-4 rounded-xl shadow-sm border">
                  <div className="text-xs text-slate-400 uppercase">{i.category}</div>
                  <div className="font-bold text-lg">{i.name}</div>
                  <div className="text-2xl font-extrabold text-amber-600 mt-1">{i.balance} <span className="text-sm font-normal text-slate-600">{i.unit}</span></div>
                </div>
              ))}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border overflow-x-auto">
              <h3 className="font-bold mb-3">Traceable Stock Ledger (Every Movement)</h3>
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100"><tr><th className="p-2">ID</th><th className="p-2">Item</th><th className="p-2">Change</th><th className="p-2">Source</th><th className="p-2">Ref ID</th></tr></thead>
                <tbody>
                  {ledger.map(l => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">#{l.id}</td><td className="p-2 font-medium">{l.item}</td>
                      <td className={`p-2 font-bold ${l.qty_change > 0 ? "text-emerald-600" : "text-red-600"}`}>{l.qty_change > 0 ? `+${l.qty_change}` : l.qty_change}</td>
                      <td className="p-2 uppercase text-xs">{l.source_type}</td><td className="p-2">{l.source_id || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "production" && (
          <div className="grid md:grid-cols-2 gap-6">
            <form onSubmit={handlePurchase} className="bg-white p-5 rounded-xl shadow-sm border space-y-3">
              <h2 className="font-bold text-lg">1. Record Raw Material Purchase</h2>
              <select value={purItem} onChange={e => setPurItem(e.target.value)} className="w-full border p-2 rounded">
                {master.items.filter(i => i.category !== "finished").map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input type="number" step="0.01" value={purQty} onChange={e => setPurQty(e.target.value)} placeholder="Qty" className="w-full border p-2 rounded" />
              <input type="number" step="0.01" value={purCost} onChange={e => setPurCost(e.target.value)} placeholder="Rate per unit (Rs)" className="w-full border p-2 rounded" />
              <button className="w-full bg-slate-800 text-white py-2 rounded font-medium">Add Purchase to Stock</button>
            </form>

            <form onSubmit={handleProduction} className="bg-white p-5 rounded-xl shadow-sm border space-y-3">
              <h2 className="font-bold text-lg">2. Production Run (Murukku 200g - BOM: 200 pkts)</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label>Flour (kg) [Std: 40]<input type="number" step="0.1" value={prodForm.flour_qty} onChange={e => setProdForm({...prodForm, flour_qty: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Oil (L) [Std: 10]<input type="number" step="0.1" value={prodForm.oil_qty} onChange={e => setProdForm({...prodForm, oil_qty: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Spice (kg) [Std: 1.2]<input type="number" step="0.1" value={prodForm.spice_qty} onChange={e => setProdForm({...prodForm, spice_qty: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Good Packets [Exp: 200]<input type="number" value={prodForm.actual_packets} onChange={e => setProdForm({...prodForm, actual_packets: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Damaged Pouches<input type="number" value={prodForm.damaged_pouches} onChange={e => setProdForm({...prodForm, damaged_pouches: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Cartons Used<input type="number" value={prodForm.cartons_used} onChange={e => setProdForm({...prodForm, cartons_used: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Labour Cost (Rs)<input type="number" value={prodForm.labour_cost} onChange={e => setProdForm({...prodForm, labour_cost: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
                <label>Gas/Power Cost (Rs)<input type="number" value={prodForm.overhead_cost} onChange={e => setProdForm({...prodForm, overhead_cost: Number(e.target.value)})} className="w-full border p-2 rounded mt-1"/></label>
              </div>
              <button className="w-full bg-amber-600 text-white py-2 rounded font-bold hover:bg-amber-700">Save Run & Calculate Variance</button>

              {prodResult && (
                <div className={`p-3 rounded-lg text-sm ${prodResult.flagged ? "bg-red-50 border border-red-300 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
                  <div className="font-bold flex items-center gap-1"><AlertTriangle size={16}/> {prodResult.flagged ? "VARIANCE FLAGGED (>3% Tolerance)" : "Within Tolerance"}</div>
                  <div>Yield Variance: <b>{prodResult.yield_variance_pct}%</b> | Oil Variance: <b>+{prodResult.oil_variance_pct}%</b></div>
                  <div className="mt-1 text-base">Cost per Packet: <b>Rs.{prodResult.cost_per_packet}</b> (Selling: Rs.50 | Margin: Rs.{(50 - prodResult.cost_per_packet).toFixed(2)})</div>
                </div>
              )}
            </form>
          </div>
        )}

        {tab === "salesman" && (
          <div className="max-w-md mx-auto bg-white p-5 rounded-xl shadow-sm border space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2"><ShoppingCart/> Field Order Entry (Mobile View)</h2>
            <form onSubmit={handleCreateOrder} className="space-y-3">
              <div>
                <label className="text-sm font-medium">Select Customer</label>
                <select value={orderCust} onChange={e => setOrderCust(e.target.value)} className="w-full border p-2 rounded mt-1">
                  {master.customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.state})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Murukku 200g (Packets @ Rs.50)</label>
                <input type="number" value={orderQty} onChange={e => setOrderQty(e.target.value)} className="w-full border p-2 rounded mt-1" />
              </div>
              <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">Submit Order to Factory</button>
            </form>
          </div>
        )}

        {tab === "admin" && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2"><FileText/> Order Verification, GST Billing & Payments</h2>
            {orders.map(o => (
              <div key={o.id} className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <div className="font-bold text-lg">Order #{o.id} — {o.customer_name} <span className="text-xs bg-slate-100 px-2 py-1 rounded">{o.customer_state}</span></div>
                  <div className="text-sm text-slate-600">Qty: <b>{o.items?.[0]?.qty ?? 0} packets</b> | Taxable: Rs.{o.taxable_amount}</div>
                  {o.status === "submitted" && o.stock_shortage > 0 && (
                    <div className="text-red-600 text-sm font-bold mt-1 flex items-center gap-1"><AlertTriangle size={15}/> Shortage of {o.stock_shortage} packets! ({o.customer_state === "Tamil Nadu" ? "CGST+SGST" : "IGST 5%"} applies if invoiced)</div>
                  )}
                  {o.status === "dispatched" && (
                    <div className="text-sm mt-1 text-emerald-700 font-medium">
                      Invoice: <b>{o.invoice_number}</b> | CGST: Rs.{o.cgst} | SGST: Rs.{o.sgst} | IGST: Rs.{o.igst} | Total: <b>Rs.{o.total_amount}</b> | Paid: Rs.{o.paid_amount} | <span className="text-red-600 font-bold">Due: Rs.{o.outstanding}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.status === "submitted" && (
                    <button onClick={() => handleDispatch(o.id)} className="bg-emerald-600 text-white px-4 py-2 rounded font-medium text-sm">Approve, GST Invoice & Dispatch</button>
                  )}
                  {o.status === "dispatched" && (
                    <>
                      <button onClick={() => downloadInvoicePDF(o)} className="bg-slate-800 text-white px-3 py-2 rounded text-sm flex items-center gap-1"><Download size={14}/> PDF Invoice</button>
                      {o.outstanding > 0 && (
                        <div className="flex items-center gap-1">
                          <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-24 border p-1.5 rounded text-sm" />
                          <button onClick={() => handlePayment(o.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Record Payment</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toastNotification}
    </div>
  );
}
