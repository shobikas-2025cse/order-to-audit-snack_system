import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Factory, ShoppingCart, FileText, BarChart3, AlertTriangle, CheckCircle, Download, LogOut, X, RotateCcw, IndianRupee, TrendingUp, PackageCheck, Boxes, ArrowUpRight, LockKeyhole, UserRound, ShieldCheck } from "lucide-react";

// const API = (import.meta.env.VITE_API_URL
//   || (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
//     ? "http://127.0.0.1:8000/api"
//     : "/api")).replace(/\/$/, "");
const API = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:8001/api"
  : "https://snack-erp-backend.onrender.com/api";


export default function App() {
  const [firebaseToken, setFirebaseToken] = useState(null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [master, setMaster] = useState({ items: [], customers: [], boms: [] });
  const [orders, setOrders] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [audit, setAudit] = useState(null);
  const [toast, setToast] = useState(null);
  const [resetting, setResetting] = useState(false);
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

  
const loadAll = async (role, token) => {
  const roleEndpoints = {
    salesman: ["master-data"],
    production: ["master-data", "ledger"],
    admin: ["orders"],
    auditor: ["master-data", "orders", "ledger", "audit-summary"],
    owner: ["master-data", "orders", "ledger", "audit-summary"]
  };

  const endpoints = roleEndpoints[role];

  if (!endpoints) {
    throw new Error("This account does not have an assigned workspace.");
  }

  if (!token) {
    throw new Error("Authentication token is missing. Please sign in again.");
  }

  const responses = await Promise.all(
    endpoints.map(endpoint =>
      fetch(`${API}/${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
    )
  );

  if (responses.some(response => !response.ok)) {
    throw new Error("Unable to load workspace data. Please check your access permissions.");
  }

  const payloads = await Promise.all(
    responses.map(response => response.json())
  );

  const data = Object.fromEntries(
    endpoints.map((endpoint, index) => [endpoint, payloads[index]])
  );

  if (data["master-data"]) {
    setMaster(data["master-data"]);
  } else {
    setMaster({ items: [], customers: [], boms: [] });
  }

  setOrders(data.orders || []);
  setLedger(data.ledger || []);
  setAudit(data["audit-summary"] || null);
};


  const defaultTabForRole = {
    salesman: "salesman",
    production: "production",
    admin: "admin",
    auditor: "dashboard",
    owner: "dashboard"
  };

   
const handleLogin = async event => {
  event.preventDefault();
  setLoginLoading(true);

  try {
    // Step 1: Authenticate using Firebase
    const credential = await signInWithEmailAndPassword(
      auth,
      username.trim(),
      password
    );

    // Step 2: Get Firebase ID token
    const token = await credential.user.getIdToken();

    // Step 3: Ask backend to identify the ERP user and role
    const response = await fetch(`${API}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Unable to identify ERP account.");
    }

    const loggedInUser = await response.json();

    // Step 4: Load the correct dashboard
    const defaultTab = defaultTabForRole[loggedInUser.role];

    if (!defaultTab) {
      throw new Error("This account does not have an assigned workspace.");
    }

    await loadAll(loggedInUser.role, token);

    setFirebaseToken(token);
    setUser(loggedInUser);
    setTab(defaultTab);
    setPassword("");

    showToast(`Signed in as ${loggedInUser.username}.`);

  } catch (error) {
    console.error("Firebase login error:", error);

    showToast(
      error.code === "auth/invalid-credential"
        ? "Invalid email or password."
        : error.message || "Unable to sign in.",
      "error"
    );

  } finally {
    setLoginLoading(false);
  }
};


  const quickDemoFill = demoEmail => {
  setUsername(demoEmail);
  setPassword("");
};

 
const handleResetBenchmark = async () => {
  if (!window.confirm("Reset all demo data to the benchmark state? This will remove current orders, payments, and stock movements.")) return;

  setResetting(true);
  try {
    const res = await fetch(`${API}/reset-benchmark`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firebaseToken}`
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Benchmark reset failed.");

    await loadAll(user.role, firebaseToken);
    showToast(data.message || "Demo data reset successfully.", "success");
  } catch (error) {
    showToast(error.message || "Unable to reset demo data.", "error");
  } finally {
    setResetting(false);
  }
};


  const finishedItem = master.items.find(item => item.category === "finished");
  const selectedCustomer = master.customers.find(customer => customer.id === Number(orderCust));
  const finishedStock = finishedItem?.balance ?? 0;
  const orderSubtotal = Number(orderQty || 0) * Number(finishedItem?.selling_price ?? 50);
  const orderTax = orderSubtotal * 0.05;
  const isInterstate = selectedCustomer?.state?.toLowerCase() !== "tamil nadu";
  const formatMoney = amount => `Rs.${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const weightedAverageCost = itemName => {
    const purchases = ledger.filter(entry => entry.item === itemName && ["opening", "purchase"].includes(entry.source_type) && entry.qty_change > 0);
    const quantity = purchases.reduce((sum, entry) => sum + entry.qty_change, 0);
    return quantity
      ? purchases.reduce((sum, entry) => sum + entry.qty_change * entry.unit_cost, 0) / quantity
      : 0;
  };
  const getActualBatchQty = item => {
    if (item.name === "Flour") return Number(prodForm.flour_qty);
    if (item.name === "Cooking oil") return Number(prodForm.oil_qty);
    if (item.name === "Salt and spice mix") return Number(prodForm.spice_qty);
    if (item.name === "200 g pouch") return Number(prodForm.actual_packets) + Number(prodForm.damaged_pouches);
    if (item.name === "Carton") return Number(prodForm.cartons_used);
    return 0;
  };
  const productionBom = master.boms
    .filter(bom => bom.finished_item_id === finishedItem?.id)
    .map(bom => {
      const item = master.items.find(candidate => candidate.id === bom.raw_item_id);
      return item ? { ...bom, item, actual: getActualBatchQty(item) } : null;
    })
    .filter(Boolean);
  const materialCost = productionBom.reduce((sum, row) => sum + row.actual * weightedAverageCost(row.item.name), 0);
  const labourCost = Number(prodForm.labour_cost || 0);
  const overheadCost = Number(prodForm.overhead_cost || 0);
  const batchCost = materialCost + labourCost + overheadCost;
  const costSegments = [
    { label: "Material", value: materialCost, color: "bg-amber-500" },
    { label: "Labour", value: labourCost, color: "bg-sky-500" },
    { label: "Overhead", value: overheadCost, color: "bg-amber-500" }
  ];

 
const handlePurchase = async (e) => {
  e.preventDefault();

  const res = await fetch(`${API}/purchases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      item_id: Number(purItem),
      qty: Number(purQty),
      unit_cost: Number(purCost)
    })
  });

  if (!res.ok) {
    const data = await res.json();
    showToast(data.detail || "Purchase failed.", "error");
    return;
  }

  showToast("Purchase recorded & Stock updated!", "success");
  await loadAll(user.role, firebaseToken);
};


  
const handleProduction = async (e) => {
  e.preventDefault();

  const murukku = master.items.find(i => i.category === "finished");

  const res = await fetch(`${API}/production`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      finished_item_id: murukku.id,
      ...prodForm
    })
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.detail || "Production failed.", "error");
    return;
  }

  setProdResult(data);
  await loadAll(user.role, firebaseToken);
};


  
const handleCreateOrder = async (e) => {
  e.preventDefault();

  const murukku = master.items.find(i => i.category === "finished");

  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      customer_id: Number(orderCust),
      salesman_id: user.id,
      items: [{ item_id: murukku.id, qty: Number(orderQty) }]
    })
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.detail || "Order submission failed.", "error");
    return;
  }

  showToast("Order submitted to factory!", "success");
  await loadAll(user.role, firebaseToken);
};


const handleDispatch = async (orderId) => {
  const res = await fetch(`${API}/orders/${orderId}/approve-dispatch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firebaseToken}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(`Blocked: ${data.detail}`, "error");
    return;
  }

  showToast(`Dispatched! Invoice: ${data.invoice_number}`, "success");
  await loadAll(user.role, firebaseToken);
};


 
const handlePayment = async (orderId) => {
  const res = await fetch(`${API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      order_id: orderId,
      amount: Number(payAmount)
    })
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.detail || "Payment recording failed.", "error");
    return;
  }

  showToast("Payment recorded!", "success");
  await loadAll(user.role, firebaseToken);
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
    const demoAccounts = [
  ["snackerp.demo+production@gmail.com", "Production"],
  ["snackerp.demo+sales1@gmail.com", "Sales A"],
  ["snackerp.demo+sales2@gmail.com", "Sales B"],
  ["snackerp.demo+admin@gmail.com", "Admin"],
  ["snackerp.demo+auditor@gmail.com", "Auditor"],
  ["snackerp.demo+owner@gmail.com", "Owner"]
];

    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-4 py-10">
          <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-xl md:grid-cols-[1.05fr_0.95fr]">
            <section className="flex flex-col justify-between bg-[#1C1917] p-8 text-stone-100 md:p-12">
              <div>
                <div className="mb-12 inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800/70 px-3 py-1.5 text-xs font-medium text-stone-300"><span className="h-2 w-2 rounded-full bg-amber-500"/> MANUFACTURING OPERATIONS</div>
                <div className="mb-5 inline-flex rounded-2xl bg-amber-500 p-3 text-stone-950"><Factory size={25}/></div>
                <h1 className="max-w-sm text-4xl font-bold tracking-tight">SuvaiLedger <span className="text-amber-500">ERP</span></h1>
                <p className="mt-4 max-w-sm leading-7 text-stone-400">One clear view of production, orders, inventory and GST—built for the rhythm of your factory.</p>
              </div>
              <div className="mt-12 grid grid-cols-2 gap-3 text-sm text-stone-300">
                <div className="rounded-2xl border border-stone-700 bg-stone-800/60 p-4"><Boxes className="mb-3 text-amber-500" size={20}/> Live inventory</div>
                <div className="rounded-2xl border border-stone-700 bg-stone-800/60 p-4"><TrendingUp className="mb-3 text-amber-500" size={20}/> Audit-ready reports</div>
              </div>
            </section>
            <section className="p-8 md:p-12">
              <div className="mb-7">
                <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">Secure sign in</p>
                <h2 className="mt-2 text-2xl font-bold text-stone-900">Welcome back</h2>
                <p className="mt-2 text-sm text-stone-500">Use your assigned account to open your workspace.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block text-sm font-semibold text-stone-700">Email address
  <span className="relative mt-1.5 block">
    <UserRound size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
    <input
      required
      type="email"
      autoComplete="email"
      value={username}
      onChange={event => setUsername(event.target.value)}
      className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-sm font-normal text-stone-900 outline-none transition focus:border-amber-600 focus:ring-4 focus:ring-amber-100"
      placeholder="Enter your registered email"
    />
  </span>
</label>

<label className="block text-sm font-semibold text-stone-700 mt-4">
  Password
  <input
    required
    type="password"
    autoComplete="current-password"
    value={password}
    onChange={(event) => setPassword(event.target.value)}
    placeholder="Enter your account password"
    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white py-3 px-3 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-4 focus:ring-amber-100"
  />
</label>

                <button type="submit" disabled={loginLoading} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D97706] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-60">{loginLoading ? "Signing in…" : "Sign in"}<ArrowUpRight size={16}/></button>
              </form>
              <div className="mt-7 border-t border-stone-100 pt-5">
<p className="text-[11px] text-stone-400">Enter your account password</p>                <div className="flex flex-wrap gap-2">{demoAccounts.map(([demoUsername, label]) => <button key={demoUsername} type="button" onClick={() => quickDemoFill(demoUsername)} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800">{label}</button>)}</div>
                <p className="mt-3 text-xs text-stone-400">Demo badges fill the sign-in form; submit to continue.</p>
              </div>
            </section>
          </div>
        </div>
        {toastNotification}
      </>
    );
  }

  const navItems = [
    ["dashboard", "Audit overview", BarChart3],
    ["production", "Production & purchases", Factory],
    ["salesman", "Field orders", ShoppingCart],
    ["admin", "GST billing & payments", FileText]
  ];
  const roleTabs = {
    salesman: ["salesman"],
    production: ["production"],
    admin: ["admin"],
    auditor: ["dashboard"],
    owner: ["dashboard"]
  };
  const visibleNavItems = navItems.filter(([id]) => roleTabs[user.role]?.includes(id));
  const roleName = { salesman: "Sales", production: "Production", admin: "Finance admin", auditor: "Auditor", owner: "Owner" }[user.role] || user.role;
  const canResetBenchmark = user.role === "admin";
  const customerBalances = audit?.customers || [];
  const pendingReceivables = customerBalances.reduce((sum, customer) => sum + Number(customer.outstanding || 0), 0);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-800 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[#1C1917] text-stone-200 lg:flex">
        <div className="border-b border-stone-800 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-600 p-2.5 text-stone-950"><Factory size={21}/></div>
            <div><div className="font-bold tracking-tight text-white">SuvaiLedger</div><div className="text-xs text-stone-400">Manufacturing ERP</div></div>
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-center gap-3 rounded-xl bg-stone-800/80 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-stone-700 text-amber-400"><UserRound size={17}/></div>
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{user.username}</div><div className="text-xs text-stone-400">{roleName}</div></div>
          </div>
        </div>
        <div className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Workspace</div>
        <nav className="space-y-1 px-3">
          {visibleNavItems.map(([id, label, Icon]) => (
            <button type="button" key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${tab === id ? "bg-amber-600 text-white shadow-sm" : "text-stone-400 hover:bg-stone-800 hover:text-stone-100"}`}><Icon size={17}/>{label}</button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-stone-800 p-4">
          {canResetBenchmark && <button type="button" onClick={handleResetBenchmark} disabled={resetting} className="flex w-full items-center gap-2 rounded-xl border border-stone-700 px-3 py-2.5 text-left text-xs font-semibold text-stone-300 transition hover:border-amber-600/60 hover:bg-stone-800 hover:text-amber-300 disabled:opacity-60"><RotateCcw size={15} className={resetting ? "animate-spin" : ""}/>{resetting ? "Resetting benchmark…" : "Reset benchmark data"}</button>}

<button
  type="button"
  onClick={async () => {
    try {
      await signOut(auth);

      setFirebaseToken(null);
      setUser(null);
      setPassword("");
      setUsername("");
      setTab("dashboard");

      showToast("Signed out successfully.", "success");
    } catch (error) {
      showToast("Unable to sign out. Please try again.", "error");
    }
  }}
  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-stone-400 transition hover:bg-stone-800 hover:text-white"
>
  <LogOut size={15} /> Sign out / switch role
</button>
          <p className="px-1 pt-1 text-[10px] text-stone-600">SUVAILEDGER ERP · DEMO</p>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 flex-1 pb-24 lg:pb-8">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-[#FAF8F5]/95 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#1C1917] p-2 text-amber-500"><Factory size={18}/></div>
            <div><div className="text-sm font-bold text-stone-900">SuvaiLedger ERP</div><div className="text-[11px] text-stone-500">{roleName} · {user.username}</div></div>
          </div>
          <div className="flex items-center gap-1">
            {canResetBenchmark && <button type="button" aria-label="Reset benchmark data" title="Reset benchmark data" onClick={handleResetBenchmark} disabled={resetting} className="rounded-lg p-2 text-stone-500 hover:bg-amber-100 hover:text-amber-800 disabled:opacity-50"><RotateCcw size={17} className={resetting ? "animate-spin" : ""}/></button>}
            <button type="button" aria-label="Sign out or switch role" onClick={() => { setUser(null); setPassword(""); setTab("dashboard"); }} className="rounded-lg p-2 text-stone-500 hover:bg-stone-200"><LogOut size={17}/></button>
          </div>
        </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="hidden items-center justify-between lg:flex">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">SuvaiLedger ERP</p><p className="mt-1 text-sm text-stone-600">Operations workspace</p></div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600"><ShieldCheck size={14} className="text-amber-700"/>{roleName} access</span>
            {canResetBenchmark && <button type="button" onClick={handleResetBenchmark} disabled={resetting} className="inline-flex items-center gap-2 rounded-lg border border-stone-200/80 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-60"><RotateCcw size={14} className={resetting ? "animate-spin" : ""}/>{resetting ? "Resetting…" : "Reset benchmark data"}</button>}
          </div>
        </div>
        {tab === "dashboard" && roleTabs[user.role]?.includes("dashboard") && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-sm font-semibold text-amber-700">AUDITOR OVERVIEW</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Business at a glance</h1><p className="mt-1 text-sm text-stone-500">Live stock, receivables and GST position.</p></div>
              <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"><Download size={16}/> Export Excel</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-stone-500">Total Revenue</span><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><IndianRupee size={18}/></span></div>
                <div className="mt-4 text-2xl font-bold tracking-tight text-stone-900">{formatMoney(audit?.total_revenue)}</div><p className="mt-1 text-xs text-stone-500">Dispatched sales · excludes GST</p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-stone-500">GST Liability</span><span className="rounded-xl bg-amber-50 p-2 text-amber-800"><FileText size={18}/></span></div>
                <div className="mt-4 text-2xl font-bold tracking-tight text-stone-900">{formatMoney(audit?.gst?.total_tax)}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-stone-500"><span>CGST<br/><b className="text-stone-700">{formatMoney(audit?.gst?.cgst)}</b></span><span>SGST<br/><b className="text-stone-700">{formatMoney(audit?.gst?.sgst)}</b></span><span>IGST<br/><b className="text-stone-700">{formatMoney(audit?.gst?.igst)}</b></span></div>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-stone-500">Pending Receivables</span><span className="rounded-xl bg-amber-50 p-2 text-amber-700"><TrendingUp size={18}/></span></div>
                <div className="mt-4 text-2xl font-bold tracking-tight text-stone-900">{formatMoney(pendingReceivables)}</div><p className="mt-1 text-xs text-stone-500">Outstanding customer balances</p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-stone-500">Active Alerts</span><span className={`rounded-xl p-2 ${audit?.active_alerts ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}><AlertTriangle size={18}/></span></div>
                <div className="mt-4 text-2xl font-bold tracking-tight text-stone-900">{audit?.active_alerts ?? 0}</div><p className="mt-1 text-xs text-stone-500">{audit?.alerts?.flagged_runs ?? 0} production · {audit?.alerts?.shortage_orders ?? 0} stock shortage</p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4"><div><h2 className="font-semibold text-stone-900">Customer Outstanding Ledger</h2><p className="mt-1 text-xs text-stone-500">Billed versus paid by account</p></div><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{customerBalances.length} accounts</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-[#FAF8F5] text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Billed</th><th className="px-4 py-3 font-semibold">Paid</th><th className="px-5 py-3 text-right font-semibold">Outstanding</th></tr></thead>
                    <tbody>{customerBalances.map((customer, index) => <tr key={`${customer.name}-${index}`} className="border-t border-stone-100"><td className="px-5 py-4"><div className="font-medium text-stone-800">{customer.name}</div><div className="text-xs text-stone-500">{customer.state}</div></td><td className="px-4 py-4 text-stone-600">{formatMoney(customer.total_billed)}</td><td className="px-4 py-4 text-stone-600">{formatMoney(customer.total_paid)}</td><td className="px-5 py-4 text-right font-semibold text-stone-900">{formatMoney(customer.outstanding)}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-stone-900">Stock Health</h2><p className="mt-1 text-xs text-stone-500">Current on-hand inventory by item</p></div><PackageCheck size={19} className="text-amber-700"/></div>
                <div className="space-y-4">{master.items.map(item => {
                  const health = item.balance <= 0 ? 0 : Math.min(100, Math.max(12, item.balance / (item.category === "finished" ? 100 : 50) * 100));
                  return <div key={item.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-stone-700">{item.name}</span><span className="whitespace-nowrap text-xs text-stone-500">{item.balance} {item.unit}</span></div><div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${health < 25 ? "bg-rose-500" : health < 55 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${health}%` }}/></div></div>;
                })}</div>
              </section>
            </div>

            <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-stone-900">Batch Cost Breakdown</h2><p className="mt-1 text-xs text-stone-500">Live estimate using the standard batch inputs and current weighted material costs</p></div>
                <div className="text-right"><p className="text-xs font-medium text-stone-500">Estimated batch total</p><p className="mt-0.5 text-lg font-bold text-stone-900">{formatMoney(batchCost)}</p></div>
              </div>
              <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-stone-100">{costSegments.map(segment => <div key={segment.label} className={segment.color} style={{ width: `${batchCost > 0 ? segment.value / batchCost * 100 : 0}%` }} title={`${segment.label}: ${formatMoney(segment.value)}`}/>)}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">{costSegments.map(segment => <div key={segment.label} className="flex items-center justify-between rounded-xl bg-[#FAF8F5] px-3 py-2.5 text-sm"><span className="flex items-center gap-2 text-stone-600"><i className={`h-2.5 w-2.5 rounded-full ${segment.color}`}/>{segment.label}</span><span className="font-semibold text-stone-900">{formatMoney(segment.value)}</span></div>)}</div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
              <div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-stone-900">Traceable Stock Ledger</h2><p className="mt-1 text-xs text-stone-500">Latest stock movements across the factory</p></div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="sticky top-0 bg-[#FAF8F5] text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">ID</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Source</th><th className="px-5 py-3">Ref ID</th></tr></thead>
                  <tbody>{ledger.map(entry => <tr key={entry.id} className="border-t border-stone-100"><td className="px-5 py-3 text-stone-500">#{entry.id}</td><td className="px-4 py-3 font-medium text-stone-800">{entry.item}</td><td className={`px-4 py-3 font-semibold ${entry.qty_change > 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.qty_change > 0 ? `+${entry.qty_change}` : entry.qty_change}</td><td className="px-4 py-3 text-xs uppercase text-stone-500">{entry.source_type}</td><td className="px-5 py-3 text-stone-500">{entry.source_id || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {tab === "production" && user.role === "production" && (
          <section className="space-y-6">
            <div><p className="text-sm font-semibold text-amber-600">FACTORY FLOOR</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Production & materials</h1><p className="mt-1 text-sm text-stone-500">Track procurement, compare the live batch with BOM standards and monitor material availability.</p></div>
            <div className="grid items-start gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <form onSubmit={handlePurchase} className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Procurement</p><h2 className="mt-1 text-lg font-bold text-stone-900">Record a purchase</h2></div>
                <label className="block text-sm font-medium text-stone-700">Raw material<select value={purItem} onChange={e => setPurItem(e.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200/80 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100">{master.items.filter(item => item.category !== "finished").map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
                <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-stone-700">Quantity<input type="number" step="0.01" value={purQty} onChange={e => setPurQty(e.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200/80 px-3 py-2.5 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"/></label><label className="text-sm font-medium text-stone-700">Unit cost<input type="number" step="0.01" value={purCost} onChange={e => setPurCost(e.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200/80 px-3 py-2.5 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"/></label></div>
                <button className="w-full rounded-lg bg-[#1C1917] py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">Add purchase to stock</button>
              </form>

              <form onSubmit={handleProduction} className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Batch calculator</p><h2 className="mt-1 text-lg font-bold text-stone-900">Murukku 200 g production run</h2></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">BOM · 200 packets</span></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[["Flour · kg", "flour_qty", "0.1"], ["Oil · L", "oil_qty", "0.1"], ["Spice · kg", "spice_qty", "0.1"], ["Good packets", "actual_packets", "1"], ["Damaged pouches", "damaged_pouches", "1"], ["Cartons used", "cartons_used", "1"], ["Labour · Rs", "labour_cost", "1"], ["Overhead · Rs", "overhead_cost", "1"]].map(([label, field, step]) => <label key={field} className="text-xs font-semibold text-stone-600">{label}<input type="number" min="0" step={step} value={prodForm[field]} onChange={e => setProdForm({ ...prodForm, [field]: Number(e.target.value) })} className="mt-1.5 w-full rounded-lg border border-stone-200/80 px-3 py-2.5 text-sm font-normal text-stone-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"/></label>)}
                </div>

                <div className="rounded-xl border border-stone-100 bg-[#FAF8F5] p-4">
                  <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-stone-900">BOM standard vs actual</h3><p className="mt-0.5 text-xs text-stone-500">Live comparison updates as the batch changes</p></div><span className="text-xs font-semibold text-stone-500">Expected yield: {Number(master.boms.find(bom => bom.finished_item_id === finishedItem?.id)?.expected_yield ?? 200)} pkts</span></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-stone-500"><tr><th className="py-2">Material</th><th className="py-2 text-right">BOM standard</th><th className="py-2 text-right">Actual</th><th className="py-2 text-right">Variance</th></tr></thead><tbody>
                    {productionBom.map(row => {
                      const variance = row.actual - Number(row.qty_per_batch);
                      return <tr key={row.id} className="border-t border-stone-200/80"><td className="py-2.5 font-medium text-stone-700">{row.item.name}</td><td className="py-2.5 text-right text-stone-600">{Number(row.qty_per_batch)} {row.item.unit}</td><td className="py-2.5 text-right font-semibold text-stone-800">{row.actual} {row.item.unit}</td><td className={`py-2.5 text-right font-semibold ${variance > 0 ? "text-amber-700" : variance < 0 ? "text-amber-700" : "text-emerald-700"}`}>{variance > 0 ? "+" : ""}{Number(variance.toFixed(2))}</td></tr>;
                    })}
                    <tr className="border-t border-stone-200/80"><td className="py-2.5 font-medium text-stone-700">Finished packets</td><td className="py-2.5 text-right text-stone-600">{Number(master.boms.find(bom => bom.finished_item_id === finishedItem?.id)?.expected_yield ?? 200)}</td><td className="py-2.5 text-right font-semibold text-stone-800">{Number(prodForm.actual_packets)}</td><td className={`py-2.5 text-right font-semibold ${Number(prodForm.actual_packets) < 194 ? "text-amber-700" : "text-emerald-700"}`}>{Number(prodForm.actual_packets) - Number(master.boms.find(bom => bom.finished_item_id === finishedItem?.id)?.expected_yield ?? 200)}</td></tr>
                  </tbody></table></div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-stone-100 p-4"><div className="mb-3"><h3 className="text-sm font-semibold text-stone-900">Material stock health</h3><p className="mt-0.5 text-xs text-stone-500">On-hand quantity compared with this batch requirement</p></div>
                    <div className="space-y-3">{productionBom.map(row => {
                      const needed = row.actual;
                      const coverage = needed > 0 ? Math.min(100, row.item.balance / needed * 100) : 100;
                      const enough = row.item.balance >= needed;
                      return <div key={row.id}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-medium text-stone-700">{row.item.name}</span><span className={enough ? "text-emerald-700" : "text-rose-600"}>{row.item.balance} / {needed} {row.item.unit}</span></div><div className="h-1.5 rounded-full bg-stone-100"><div className={`h-1.5 rounded-full ${enough ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${coverage}%` }}/></div></div>;
                    })}</div>
                  </div>
                  <div className="rounded-xl border border-stone-100 p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-stone-900">Batch cost breakdown</h3><p className="mt-0.5 text-xs text-stone-500">Estimated from current weighted stock cost</p></div><span className="text-sm font-bold text-stone-900">{formatMoney(batchCost)}</span></div>
                    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-100">{costSegments.map(segment => <div key={segment.label} className={segment.color} style={{ width: `${batchCost > 0 ? segment.value / batchCost * 100 : 0}%` }} title={`${segment.label}: ${formatMoney(segment.value)}`}/>)}</div>
                    <div className="mt-4 space-y-2">{costSegments.map(segment => <div key={segment.label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-stone-600"><i className={`h-2.5 w-2.5 rounded-full ${segment.color}`}/>{segment.label}</span><span className="font-semibold text-stone-800">{formatMoney(segment.value)}</span></div>)}</div>
                  </div>
                </div>
                <button className="w-full rounded-lg bg-amber-500 py-3 text-sm font-bold text-stone-950 transition hover:bg-amber-400">Save run & calculate variance</button>
                {prodResult && <div className={`rounded-xl border p-4 text-sm ${prodResult.flagged ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><div className="flex items-center gap-2 font-bold"><AlertTriangle size={16}/>{prodResult.flagged ? "Variance flagged · exceeds 3% tolerance" : "Batch is within tolerance"}</div><p className="mt-1">Yield variance: <b>{prodResult.yield_variance_pct}%</b> · Oil variance: <b>{prodResult.oil_variance_pct}%</b></p><p className="mt-1">Calculated cost per packet: <b>{formatMoney(prodResult.cost_per_packet)}</b> · Estimated batch cost: <b>{formatMoney(Number(prodResult.cost_per_packet) * Number(prodForm.actual_packets))}</b></p></div>}
              </form>
            </div>
          </section>
        )}

        {tab === "salesman" && user.role === "salesman" && (
          <section className="mx-auto max-w-4xl space-y-6">
            <div><p className="text-sm font-semibold text-blue-600">SALES DESK</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Create a field order</h1><p className="mt-1 text-sm text-stone-500">Check inventory and preview the tax-inclusive estimate before submitting.</p></div>
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <form onSubmit={handleCreateOrder} className="space-y-5 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-800"><ShoppingCart size={21}/></div><div><h2 className="font-bold text-stone-900">Order details</h2><p className="text-xs text-stone-500">Murukku 200 g · {formatMoney(finishedItem?.selling_price ?? 50)} per packet</p></div></div>
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${finishedStock > 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}><div className="flex items-center gap-2 text-sm font-semibold"><PackageCheck size={18}/>{finishedStock > 0 ? "Available finished stock" : "Out of stock"}</div><span className="text-sm font-bold">{finishedStock} {finishedItem?.unit || "packets"}</span></div>
                <label className="block text-sm font-semibold text-stone-700">Customer<select value={orderCust} onChange={e => setOrderCust(e.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200/80 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100">{master.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.state}</option>)}</select></label>
                <label className="block text-sm font-semibold text-stone-700">Order quantity · packets<input min="1" type="number" value={orderQty} onChange={e => setOrderQty(e.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200/80 px-3 py-3 text-sm font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"/></label>
                <button className="w-full rounded-lg bg-amber-600 py-3 text-sm font-bold text-white transition hover:bg-amber-700">Submit order to factory</button>
                {Number(orderQty) > finishedStock && <p className="text-xs font-medium text-amber-700">This order is above current available stock. It can be submitted, but dispatch will remain blocked until stock is available.</p>}
              </form>
              <aside className="h-fit rounded-2xl bg-[#1C1917] p-6 text-white shadow-lg">
                <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Live estimate</p><h2 className="mt-1 text-lg font-bold">Order summary</h2></div><IndianRupee className="text-amber-300" size={22}/></div>
                <div className="mt-7 space-y-4 text-sm"><div className="flex justify-between text-stone-300"><span>{Number(orderQty || 0)} packets × {formatMoney(finishedItem?.selling_price ?? 50)}</span><span>{formatMoney(orderSubtotal)}</span></div><div className="flex justify-between text-stone-300"><span>{isInterstate ? "IGST · 5%" : "CGST + SGST · 2.5% each"}</span><span>{formatMoney(orderTax)}</span></div>{!isInterstate && <div className="flex justify-between pl-3 text-xs text-stone-400"><span>CGST 2.5% / SGST 2.5%</span><span>{formatMoney(orderTax / 2)} each</span></div>}<div className="border-t border-white/15 pt-4"><div className="flex justify-between text-base font-bold"><span>Estimated total</span><span className="text-emerald-300">{formatMoney(orderSubtotal + orderTax)}</span></div></div></div>
                <p className="mt-6 text-xs leading-5 text-stone-400">Final tax and invoice totals are confirmed by the factory during dispatch.</p>
              </aside>
            </div>
          </section>
        )}

        {tab === "admin" && user.role === "admin" && (
          <section className="space-y-5">
            <div><p className="text-sm font-semibold text-emerald-600">FINANCE & COMPLIANCE</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">GST billing & payments</h1><p className="mt-1 text-sm text-stone-500">Verify submitted orders, dispatch invoices and record receipts.</p></div>
            {orders.length === 0 && <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">No orders yet. Submitted orders will appear here.</div>}
            {orders.map(order => (
              <article key={order.id} className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-stone-900">Order #{order.id} · {order.customer_name}</h2><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{order.customer_state}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.status === "dispatched" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{order.status}</span></div>
                    <p className="mt-2 text-sm text-stone-500">{order.items?.[0]?.qty ?? 0} packets <span className="mx-1 text-stone-300">·</span> Taxable {formatMoney(order.taxable_amount)}</p>
                    {order.status === "submitted" && order.stock_shortage > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"><AlertTriangle size={15}/> Shortage of {order.stock_shortage} packets; dispatch is blocked.</div>}
                    {order.status === "dispatched" && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-6 text-emerald-800">Invoice <b>{order.invoice_number}</b> · CGST {formatMoney(order.cgst)} · SGST {formatMoney(order.sgst)} · IGST {formatMoney(order.igst)}<br/>Total <b>{formatMoney(order.total_amount)}</b> · Paid {formatMoney(order.paid_amount)} · Due <b className="text-rose-700">{formatMoney(order.outstanding)}</b></div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.status === "submitted" && <button type="button" onClick={() => handleDispatch(order.id)} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700">Approve & dispatch</button>}
                    {order.status === "dispatched" && <><button type="button" onClick={() => downloadInvoicePDF(order)} className="inline-flex items-center gap-2 rounded-lg bg-[#1C1917] px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-700"><Download size={14}/> PDF invoice</button>{order.outstanding > 0 && <div className="flex items-center gap-1.5"><input aria-label="Payment amount" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-28 rounded-lg border border-stone-200/80 px-2.5 py-2 text-sm"/><button type="button" onClick={() => handlePayment(order.id)} className="rounded-lg bg-amber-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-amber-700">Record payment</button></div>}</>}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-700 bg-[#1C1917] px-2 pb-[env(safe-area-inset-bottom)] pt-2 lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
          {visibleNavItems.map(([id, label, Icon]) => (
            <button type="button" key={id} onClick={() => setTab(id)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition ${tab === id ? "text-amber-400" : "text-stone-400 hover:text-stone-100"}`}><Icon size={19}/><span className="truncate">{label}</span></button>
          ))}
        </div>
      </nav>
      </div>
      {toastNotification}
    </div>
  );
}
