"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Info,
  Search,
  Settings,
  Tag,
  UserRound,
  X,
} from "lucide-react";

type View = "customers" | "bookings" | "revenue" | "settings";
type Gender = "Female" | "Male";
type OrderTab = "lab" | "iv" | "peptides";

type Customer = {
  id: string;
  customerId?: string;
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  age?: number | null;
  memberCount?: number;
};

type Booking = {
  id: string;
  customer: string;
  service: string;
  vertical: "Lab" | "IV" | "Peptides";
  date: string;
  status: "Confirmed" | "Pending" | "Completed";
  amount: string;
};

type LedgerEntry = {
  id: string;
  date: string;
  desc: string;
  customer: string;
  type: string;
  amount: string;
  kind: "sale" | "peptide" | "payout";
};

type Product = {
  productId?: string;
  backendVerticalId?: string;
  name: string;
  desc: string;
  price: number;
  vertical: "Lab" | "IV";
  productType?: "PACKAGE";
  fasting?: boolean;
  tat?: string;
  sample?: string;
  duration?: string;
  pregnancy?: boolean;
  biomarkers?: string[];
  ingredients?: Array<{ name: string; desc: string }>;
};

type PeptideConsultSlot = {
  slot_start: string;
  slot_end?: string | null;
  status?: string | null;
  doctor_id?: string | null;
};

type PeptideConsultBooking = {
  consultation?: {
    consultation_id?: string;
    status?: string;
    scheduled_start_at?: string;
    slot_start_ts?: string;
  };
  lead?: {
    lead_id?: string;
    source_tag?: string | null;
    b2b_partner_id?: string | null;
    b2b_partner_name?: string | null;
  };
};

type Modal = "newCustomer" | "order" | null;

type LedgerTotals = {
  paidAed: number;
  commissionAed: number;
};

type PartnerContext = {
  seller_id: string;
  customer_id: string;
  seller?: {
    display_name?: string | null;
  };
  resolved_by?: string | null;
};

const labProducts: Product[] = [
  {
    name: "Basic Health Checkup",
    desc: "General wellness package with nurse collection.",
    price: 299,
    vertical: "Lab",
    productType: "PACKAGE",
    fasting: true,
    tat: "Results in 24-48 hours",
    sample: "Venous blood draw at home",
  },
  {
    name: "Anemia Profile",
    desc: "Focused package for anemia and iron status screening.",
    price: 399,
    vertical: "Lab",
    productType: "PACKAGE",
    fasting: false,
    tat: "Results in 48 hours",
    sample: "Venous blood draw at home",
  },
  {
    name: "Diabetes Profile",
    desc: "Metabolic screening package with home collection.",
    price: 249,
    vertical: "Lab",
    productType: "PACKAGE",
    fasting: true,
    tat: "Results in 24 hours",
    sample: "Venous blood draw at home",
  },
  {
    name: "Advanced NIPT",
    desc: "Pregnancy screening package from 10 weeks.",
    price: 1799,
    vertical: "Lab",
    productType: "PACKAGE",
    fasting: false,
    tat: "Results in 10 days",
    sample: "Venous blood draw at home",
  },
];

const ivProducts: Product[] = [
  {
    name: "Myers Cocktail",
    desc: "Energy and immunity boost",
    price: 599,
    vertical: "IV",
    duration: "45 min",
    pregnancy: false,
    ingredients: [
      { name: "Vitamin C", desc: "Antioxidant, supports immune defense" },
      { name: "Magnesium", desc: "Muscle and nerve function" },
      { name: "Calcium gluconate", desc: "Bone and muscle health" },
      { name: "B-complex", desc: "Energy metabolism" },
      { name: "Vitamin B12", desc: "Red blood cell formation" },
    ],
  },
  {
    name: "Glutathione Glow",
    desc: "Skin brightening, antioxidant",
    price: 750,
    vertical: "IV",
    duration: "45 min",
    pregnancy: true,
    ingredients: [
      { name: "Glutathione", desc: "Master antioxidant, skin brightening" },
      { name: "Vitamin C", desc: "Collagen support, brightening" },
      { name: "Saline base", desc: "Hydration carrier" },
    ],
  },
  {
    name: "Hydration Boost",
    desc: "Rehydration, electrolytes",
    price: 399,
    vertical: "IV",
    duration: "30 min",
    pregnancy: false,
    ingredients: [
      { name: "Normal saline", desc: "Rapid rehydration" },
      { name: "Electrolytes", desc: "Sodium and potassium balance" },
      { name: "B-complex", desc: "Energy support" },
    ],
  },
  {
    name: "Immunity IV",
    desc: "High-dose vitamin C and zinc",
    price: 550,
    vertical: "IV",
    duration: "45 min",
    pregnancy: true,
    ingredients: [
      { name: "High-dose Vitamin C", desc: "Immune defense, antioxidant" },
      { name: "Zinc", desc: "Immune cell function" },
      { name: "Selenium", desc: "Antioxidant protection" },
    ],
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatSlotDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Available";
  return new Intl.DateTimeFormat("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function formatSlotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AE", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  }).format(date);
}

export default function Home() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [view, setView] = useState<View>("customers");
  const [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotals, setLedgerTotals] = useState<LedgerTotals>({
    paidAed: 0,
    commissionAed: 0,
  });
  const [partnerContext, setPartnerContext] = useState<PartnerContext | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [liveLabProducts, setLiveLabProducts] = useState<Product[]>([]);
  const [liveIvProducts, setLiveIvProducts] = useState<Product[]>([]);
  const [servesPremise, setServesPremise] = useState(true);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
    gender: "Female" as Gender,
  });
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [orderTab, setOrderTab] = useState<OrderTab>("lab");
  const [orderSearch, setOrderSearch] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [peptideSlots, setPeptideSlots] = useState<PeptideConsultSlot[]>([]);
  const [selectedPeptideSlot, setSelectedPeptideSlot] = useState<PeptideConsultSlot | null>(null);
  const [peptideSlotsLoading, setPeptideSlotsLoading] = useState(false);
  const [peptideSlotsError, setPeptideSlotsError] = useState("");
  const [peptideBooking, setPeptideBooking] = useState<PeptideConsultBooking | null>(null);
  const [bookingPeptideConsult, setBookingPeptideConsult] = useState(false);

  const authHeaders = useCallback(async (contentType?: string) => {
    const token = await getToken();
    if (!token) throw new Error("missing_clerk_token");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    return headers;
  }, [getToken]);

  const refreshBookings = useCallback(async () => {
    try {
      const response = await fetch("/api/pulse/bookings", {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `bookings_${response.status}`);
      }
      setBookings(payload.bookings ?? []);
      setLiveError("");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "bookings_refresh_failed");
    }
  }, [authHeaders]);

  const refreshLedger = useCallback(async () => {
    try {
      const response = await fetch("/api/pulse/ledger", {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `ledger_${response.status}`);
      }
      setLedger(payload.ledger ?? []);
      setLedgerTotals(payload.totals ?? { paidAed: 0, commissionAed: 0 });
      setLiveError("");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "ledger_refresh_failed");
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;

    let cancelled = false;

    async function loadPulseData() {
      setLiveLoading(true);
      setLiveError("");
      try {
        const headers = await authHeaders();
        const [contextResponse, customersResponse, catalogResponse, bookingsResponse, ledgerResponse] =
          await Promise.all([
            fetch("/api/pulse/context", { cache: "no-store", headers }),
            fetch("/api/pulse/customers", { cache: "no-store", headers }),
            fetch("/api/pulse/catalog", { cache: "no-store", headers }),
            fetch("/api/pulse/bookings", { cache: "no-store", headers }),
            fetch("/api/pulse/ledger", { cache: "no-store", headers }),
          ]);

        const [contextPayload, customersPayload, catalogPayload, bookingsPayload, ledgerPayload] =
          await Promise.all([
            contextResponse.json(),
            customersResponse.json(),
            catalogResponse.json(),
            bookingsResponse.json(),
            ledgerResponse.json(),
          ]);

        const failed = [
          contextResponse,
          customersResponse,
          catalogResponse,
          bookingsResponse,
          ledgerResponse,
        ].find((response) => !response.ok);

        if (failed) {
          throw new Error(
            contextPayload.error ??
              customersPayload.error ??
              catalogPayload.error ??
              bookingsPayload.error ??
              ledgerPayload.error ??
              `pulse_api_${failed.status}`,
          );
        }

        if (cancelled) return;
        setPartnerContext(contextPayload);
        setCustomers(customersPayload.customers ?? []);
        setLiveLabProducts(catalogPayload.labProducts ?? []);
        setLiveIvProducts(catalogPayload.ivProducts ?? []);
        setBookings(bookingsPayload.bookings ?? []);
        setLedger(ledgerPayload.ledger ?? []);
        setLedgerTotals(ledgerPayload.totals ?? { paidAed: 0, commissionAed: 0 });
      } catch (error) {
        if (!cancelled) setLiveError(error instanceof Error ? error.message : "pulse_api_failed");
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }

    void loadPulseData();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, isLoaded, isSignedIn]);

  useEffect(() => {
    function refreshVisibleSellerData() {
      if (view === "bookings" && document.visibilityState === "visible") {
        void refreshBookings();
      }
      if (view === "revenue" && document.visibilityState === "visible") {
        void refreshLedger();
      }
    }

    window.addEventListener("focus", refreshVisibleSellerData);
    document.addEventListener("visibilitychange", refreshVisibleSellerData);
    return () => {
      window.removeEventListener("focus", refreshVisibleSellerData);
      document.removeEventListener("visibilitychange", refreshVisibleSellerData);
    };
  }, [refreshBookings, refreshLedger, view]);

  useEffect(() => {
    if (modal !== "order" || orderTab !== "peptides" || !orderCustomer) {
      return;
    }

    let cancelled = false;
    async function loadPeptideSlots() {
      setPeptideSlotsLoading(true);
      setPeptideSlotsError("");
      setSelectedPeptideSlot(null);
      setPeptideBooking(null);
      try {
        const response = await fetch("/api/pulse/peptide-consult", {
          cache: "no-store",
          headers: await authHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? `peptide_slots_${response.status}`);
        }
        if (cancelled) return;
        const slots = (payload.slots ?? []) as PeptideConsultSlot[];
        const availableSlots = slots.filter(
          (slot) => String(slot.status ?? "").toUpperCase() !== "BOOKED" && slot.slot_start,
        );
        setPeptideSlots(availableSlots);
        setSelectedPeptideSlot(availableSlots[0] ?? null);
      } catch (error) {
        if (!cancelled) {
          setPeptideSlots([]);
          setPeptideSlotsError(error instanceof Error ? error.message : "peptide_slots_failed");
        }
      } finally {
        if (!cancelled) setPeptideSlotsLoading(false);
      }
    }

    void loadPeptideSlots();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, modal, orderCustomer, orderTab]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [customers, search]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function changeView(nextView: View) {
    setView(nextView);
    if (nextView === "bookings") {
      void refreshBookings();
    }
    if (nextView === "revenue") {
      void refreshLedger();
    }
  }

  function resetPeptideConsult() {
    setPeptideSlots([]);
    setSelectedPeptideSlot(null);
    setPeptideSlotsError("");
    setPeptideSlotsLoading(false);
    setPeptideBooking(null);
  }

  function closeModal() {
    setModal(null);
    setCart([]);
    setOrderCustomer(null);
    setOrderTab("lab");
    setOrderSearch("");
    resetPeptideConsult();
  }

  function openNewCustomer() {
    setNewCustomer({
      name: "",
      email: "",
      phone: "",
      age: "",
      gender: "Female",
    });
    setModal("newCustomer");
  }

  async function createCustomer() {
    if (creatingCustomer) return;
    setCreatingCustomer(true);
    try {
      const response = await fetch("/api/pulse/customers", {
        method: "POST",
        headers: await authHeaders("application/json"),
        body: JSON.stringify(newCustomer),
      });
      const payload = await response.json();

      if (!response.ok || !payload.customer) {
        throw new Error(payload.error ?? "customer_create_failed");
      }

      setCustomers((current) => [
        payload.customer,
        ...current.filter((customer) => customer.id !== payload.customer.id),
      ]);
      setModal(null);
      flash(
        payload.attachedExisting
          ? "Existing customer added to this seller."
          : `Customer created. Member auto-created${
              servesPremise ? " with premise address" : ""
            }.`,
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Customer creation failed.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  function startOrder(customer: Customer) {
    resetPeptideConsult();
    setOrderCustomer(customer);
    setOrderTab("lab");
    setOrderSearch("");
    setCart([]);
    setModal("order");
  }

  async function confirmOrder() {
    if (!orderCustomer || cart.length === 0 || openingCheckout) return;
    if (new Set(cart.map((item) => item.vertical)).size > 1) {
      flash("Lab and IV cannot be added in the same cart.");
      return;
    }
    const checkoutWindow = window.open("", "_blank");
    if (checkoutWindow) checkoutWindow.opener = null;
    setOpeningCheckout(true);
    try {
      const response = await fetch("/api/pulse/checkout", {
        method: "POST",
        headers: await authHeaders("application/json"),
        body: JSON.stringify({
          customerId: orderCustomer.customerId ?? orderCustomer.id,
          products: cart.map((item) => ({
            productId: item.productId,
            vertical: item.vertical,
          })),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "checkout_intent_failed");
      }

      checkoutWindow?.location.assign(payload.checkoutUrl);
      if (!checkoutWindow) window.location.assign(payload.checkoutUrl);
      closeModal();
      flash("Checkout opened.");
    } catch (error) {
      checkoutWindow?.close();
      flash(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setOpeningCheckout(false);
    }
  }

  async function bookConsult() {
    if (!orderCustomer || !selectedPeptideSlot || bookingPeptideConsult) return;
    const doctorId = selectedPeptideSlot.doctor_id;
    if (!doctorId) {
      flash("peptide_doctor_missing");
      return;
    }
    if (!orderCustomer.phone) {
      flash("Customer phone is required for peptide consults.");
      return;
    }

    setBookingPeptideConsult(true);
    try {
      const response = await fetch("/api/pulse/peptide-consult", {
        method: "POST",
        headers: await authHeaders("application/json"),
        body: JSON.stringify({
          doctorId,
          slotStart: selectedPeptideSlot.slot_start,
          customer: {
            name: orderCustomer.name,
            email: orderCustomer.email,
            phone: orderCustomer.phone,
          },
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.consultation) {
        throw new Error(payload.error ?? `peptide_consult_${response.status}`);
      }

      setPeptideBooking(payload);
      await refreshBookings();
      setView("bookings");
      closeModal();
      flash(`Peptide consult booked and tagged "${sellerName}".`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Peptide consult booking failed.");
    } finally {
      setBookingPeptideConsult(false);
    }
  }

  const sellerName = partnerContext?.seller?.display_name || partnerContext?.seller_id || "Pulse OS";
  const showLab = orderTab === "lab";
  const showIv = orderTab === "iv";
  const showPeptides = orderTab === "peptides";
  const cartVertical = cart[0]?.vertical ?? null;
  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const displayLabProducts = (liveLabProducts.length ? liveLabProducts : labProducts).filter(
    (product) => product.vertical === "Lab" && product.productType === "PACKAGE",
  );
  const displayIvProducts = liveIvProducts.length ? liveIvProducts : ivProducts;
  const activeProductCount = orderTab === "lab" ? displayLabProducts.length : orderTab === "iv" ? displayIvProducts.length : 0;

  return (
    <main className="pls-app">
      <Sidebar activeView={view} sellerName={sellerName} onChange={changeView} />

      <section className="pls-main">
        {view === "customers" && (
          <CustomersView
            customers={filteredCustomers}
            total={customers.length}
            loading={liveLoading}
            error={liveError}
            search={search}
            onSearch={setSearch}
            onNewCustomer={openNewCustomer}
            onOpenCustomer={startOrder}
          />
        )}

        {view === "bookings" && (
          <BookingsView bookings={bookings} loading={liveLoading} error={liveError} />
        )}

        {view === "revenue" && (
          <RevenueView
            ledger={ledger}
            totals={ledgerTotals}
            loading={liveLoading}
            error={liveError}
          />
        )}

        {view === "settings" && (
          <SettingsView
            servesPremise={servesPremise}
            onServesPremise={setServesPremise}
          />
        )}
      </section>

      {modal === "newCustomer" && (
        <NewCustomerModal
          value={newCustomer}
          servesPremise={servesPremise}
          onChange={setNewCustomer}
          onClose={closeModal}
          onCreate={createCustomer}
          isCreating={creatingCustomer}
        />
      )}

      {modal === "order" && orderCustomer && (
        <OrderModal
          customer={orderCustomer}
          tab={orderTab}
          onTabChange={(nextTab) => {
            if (nextTab !== "peptides") resetPeptideConsult();
            setOrderTab(nextTab);
            setOrderSearch("");
          }}
          showLab={showLab}
          showIv={showIv}
          showPeptides={showPeptides}
          cart={cart}
          cartTotal={cartTotal}
          labProducts={displayLabProducts}
          ivProducts={displayIvProducts}
          search={orderSearch}
          activeProductCount={activeProductCount}
          cartVertical={cartVertical}
          onSearch={setOrderSearch}
          onClose={closeModal}
          onOpenDetail={setDetailProduct}
          onAdd={(product) => {
            if (cartVertical && product.vertical !== cartVertical) {
              flash("Lab and IV cannot be added in the same cart.");
              return;
            }
            setCart((current) => [...current, product]);
          }}
          onRemove={(index) =>
            setCart((current) => current.filter((_, idx) => idx !== index))
          }
          onConfirm={confirmOrder}
          isConfirming={openingCheckout}
          sellerName={sellerName}
          peptideSlots={peptideSlots}
          selectedPeptideSlot={selectedPeptideSlot}
          peptideSlotsLoading={peptideSlotsLoading}
          peptideSlotsError={peptideSlotsError}
          peptideBooking={peptideBooking}
          isBookingPeptideConsult={bookingPeptideConsult}
          onSelectPeptideSlot={setSelectedPeptideSlot}
          onBookConsult={bookConsult}
        />
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          addDisabledReason={
            cartVertical && detailProduct.vertical !== cartVertical
              ? `Remove ${cartVertical} items before adding ${detailProduct.vertical}.`
              : ""
          }
          onClose={() => setDetailProduct(null)}
          onAdd={() => {
            if (cartVertical && detailProduct.vertical !== cartVertical) {
              flash("Lab and IV cannot be added in the same cart.");
              return;
            }
            setCart((current) => [...current, detailProduct]);
            flash(`${detailProduct.name} added to order.`);
            setDetailProduct(null);
          }}
        />
      )}

      {toast && (
        <div className="pls-toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function Sidebar({
  activeView,
  sellerName,
  onChange,
}: {
  activeView: View;
  sellerName: string;
  onChange: (view: View) => void;
}) {
  return (
    <aside className="pls-side">
      <div className="pls-brand">
        <span className="pls-dardoc">DarDoc</span>
        <span className="pls-brand-kicker">Pulse OS</span>
      </div>

      <nav className="pls-nav" aria-label="Primary navigation">
        <NavButton
          active={activeView === "customers"}
          icon={<UserRound size={18} />}
          label="Customers"
          onClick={() => onChange("customers")}
        />
        <NavButton
          active={activeView === "bookings"}
          icon={<CalendarDays size={18} />}
          label="Bookings"
          onClick={() => onChange("bookings")}
        />
        <NavButton
          active={activeView === "revenue"}
          icon={<CircleDollarSign size={18} />}
          label="Revenue"
          onClick={() => onChange("revenue")}
        />
        <NavButton
          active={activeView === "settings"}
          icon={<Settings size={18} />}
          label="Settings"
          onClick={() => onChange("settings")}
        />
      </nav>

      <div className="pls-seller">
        <div className="pls-avatar">{initials(sellerName) || "P"}</div>
        <div className="pls-seller-text">
          <div className="pls-seller-name">{sellerName}</div>
          <div className="pls-seller-sub">Lab | IV | Peptides</div>
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`pls-navbtn ${active ? "is-active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function CustomersView({
  customers,
  total,
  loading,
  error,
  search,
  onSearch,
  onNewCustomer,
  onOpenCustomer,
}: {
  customers: Customer[];
  total: number;
  loading: boolean;
  error: string;
  search: string;
  onSearch: (value: string) => void;
  onNewCustomer: () => void;
  onOpenCustomer: (customer: Customer) => void;
}) {
  return (
    <>
      <div className="pls-page-head">
        <div>
          <h1>Customers</h1>
          <p>
            Search an existing customer or create a new one. Each new customer
            gets a member automatically.
          </p>
        </div>
        <button className="pls-cta" onClick={onNewCustomer}>
          <span>+</span>
          New customer
        </button>
      </div>

      <label className="pls-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search by name, email, or phone"
        />
      </label>

      <div className="pls-list-meta">
        <span>All customers</span>
        <span>{total} total</span>
      </div>

      <div className="pls-list">
        {loading && <EmptyState copy="Loading customers from Pulse..." />}
        {!loading && error && <EmptyState copy={`Pulse API error: ${error}`} />}
        {!loading && !error && customers.length === 0 && (
          <EmptyState copy="No customers yet. Create the first one for this seller." />
        )}
        {customers.map((customer) => (
          <button
            className="pls-rowbtn"
            key={customer.id}
            onClick={() => onOpenCustomer(customer)}
          >
            <span className="pls-avatar light">{initials(customer.name)}</span>
            <span className="pls-row-main">
              <span className="pls-row-title">{customer.name}</span>
              <span className="pls-row-sub">
                {customer.email} | {customer.phone}
              </span>
            </span>
            <span className="pls-row-wide">{customer.gender}</span>
            <span className="pls-pill">
              {customer.memberCount && customer.memberCount > 1 ? `${customer.memberCount} members` : "Member"}
            </span>
            <ChevronRight className="pls-chev" size={18} />
          </button>
        ))}
      </div>
    </>
  );
}

function BookingsView({
  bookings,
  loading,
  error,
}: {
  bookings: Booking[];
  loading: boolean;
  error: string;
}) {
  return (
    <>
      <h1>Bookings</h1>
      <p className="pls-page-copy">Everything you have booked for your customers.</p>

      <div className="pls-table-head bookings">
        <span>Customer</span>
        <span>Service</span>
        <span>Date</span>
        <span>Status</span>
        <span>Amount</span>
      </div>

      <div className="pls-list table">
        {loading && <EmptyState copy="Loading seller bookings..." />}
        {!loading && error && <EmptyState copy={`Pulse API error: ${error}`} />}
        {!loading && !error && bookings.length === 0 && (
          <EmptyState copy="No bookings yet for this seller." />
        )}
        {bookings.map((booking) => (
          <div className="pls-booking-row" key={booking.id}>
            <span className="pls-booking-customer">{booking.customer}</span>
            <span>
              <span className="pls-row-title small">{booking.service}</span>
              <span className="pls-row-sub">{booking.vertical}</span>
            </span>
            <span className="pls-row-wide">{booking.date}</span>
            <span>
              <span className={`pls-status ${booking.status.toLowerCase()}`}>
                {booking.status}
              </span>
            </span>
            <span className="pls-amount">{booking.amount}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RevenueView({
  ledger,
  totals,
  loading,
  error,
}: {
  ledger: LedgerEntry[];
  totals: LedgerTotals;
  loading: boolean;
  error: string;
}) {
  return (
    <>
      <h1>Revenue</h1>
      <p className="pls-page-copy">Your ledger of earnings and payouts.</p>

      <div className="pls-metrics">
        <MetricCard label="Total sales" value={`AED ${totals.paidAed.toLocaleString()}`} />
        <MetricCard label="Commission" value={`AED ${totals.commissionAed.toLocaleString()}`} />
        <MetricCard label="Pending payout" value={`AED ${totals.commissionAed.toLocaleString()}`} accent />
      </div>

      <div className="pls-table-head revenue">
        <span>Date</span>
        <span>Description</span>
        <span>Customer</span>
        <span>Type</span>
        <span>Amount</span>
      </div>

      <div className="pls-list table">
        {loading && <EmptyState copy="Loading seller ledger..." />}
        {!loading && error && <EmptyState copy={`Pulse API error: ${error}`} />}
        {!loading && !error && ledger.length === 0 && (
          <EmptyState copy="No revenue entries yet for this seller." />
        )}
        {ledger.map((entry) => (
          <div className="pls-ledger-row" key={entry.id}>
            <span className="pls-row-wide">{entry.date}</span>
            <span className="pls-row-title small">{entry.desc}</span>
            <span className="pls-row-wide">{entry.customer}</span>
            <span>
              <span className={`pls-status ${entry.kind}`}>{entry.type}</span>
            </span>
            <span className="pls-amount">{entry.amount}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="pls-empty">{copy}</div>;
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`pls-metric ${accent ? "accent" : ""}`}>
      <div>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsView({
  servesPremise,
  onServesPremise,
}: {
  servesPremise: boolean;
  onServesPremise: (value: boolean) => void;
}) {
  return (
    <>
      <h1>Settings</h1>
      <p className="pls-page-copy">
        Placeholder partner settings for the future real backend contract.
      </p>

      <section className="pls-settings-card">
        <div>
          <h2>Premise address</h2>
          <p>
            Choose whether new members receive the partner premise address by
            default.
          </p>
        </div>
        <div className="pls-premise-grid">
          <button
            className={`pls-premise ${servesPremise ? "active" : ""}`}
            onClick={() => onServesPremise(true)}
          >
            Serves on premise
            {servesPremise && <Check size={18} />}
          </button>
          <button
            className={`pls-premise ${!servesPremise ? "active" : ""}`}
            onClick={() => onServesPremise(false)}
          >
            Home visit only
            {!servesPremise && <Check size={18} />}
          </button>
        </div>
      </section>
    </>
  );
}

function NewCustomerModal({
  value,
  servesPremise,
  onChange,
  onClose,
  onCreate,
  isCreating,
}: {
  value: {
    name: string;
    email: string;
    phone: string;
    age: string;
    gender: Gender;
  };
  servesPremise: boolean;
  onChange: (value: {
    name: string;
    email: string;
    phone: string;
    age: string;
    gender: Gender;
  }) => void;
  onClose: () => void;
  onCreate: () => void;
  isCreating: boolean;
}) {
  return (
    <ModalShell width="560px">
      <div className="pls-modal-body">
        <ModalHeader
          kicker=""
          title="New customer"
          copy="A member is created automatically from these details."
          onClose={onClose}
        />
        <FieldLabel label="Full name" />
        <input
          className="pls-input"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="e.g. Noora Al Suwaidi"
        />
        <FieldLabel label="Email" />
        <input
          className="pls-input"
          value={value.email}
          onChange={(event) => onChange({ ...value, email: event.target.value })}
          placeholder="name@email.com"
        />
        <FieldLabel label="Phone" />
        <input
          className="pls-input"
          value={value.phone}
          onChange={(event) => onChange({ ...value, phone: event.target.value })}
          placeholder="+971 50 000 0000"
        />
        <div className="pls-form-grid">
          <div>
            <FieldLabel label="Age" />
            <input
              className="pls-input"
              inputMode="numeric"
              value={value.age}
              onChange={(event) =>
                onChange({ ...value, age: event.target.value })
              }
              placeholder="32"
            />
          </div>
          <div>
            <FieldLabel label="Gender" />
            <div className="pls-segment">
              <button
                className={value.gender === "Female" ? "active" : ""}
                onClick={() => onChange({ ...value, gender: "Female" })}
              >
                Female
              </button>
              <button
                className={value.gender === "Male" ? "active" : ""}
                onClick={() => onChange({ ...value, gender: "Male" })}
              >
                Male
              </button>
            </div>
          </div>
        </div>
        <div className="pls-info">
          <Info size={20} />
          <span>
            A member is auto-created with this name and email.{" "}
            {servesPremise
              ? "Your premise address is attached to the member automatically."
              : "No premise address is set, so the member uses home-visit addresses."}
          </span>
        </div>
        <button className="pls-primary-wide" onClick={onCreate} disabled={isCreating}>
          {isCreating ? "Creating..." : "Create customer and member"}
        </button>
      </div>
    </ModalShell>
  );
}

function OrderModal({
  customer,
  tab,
  onTabChange,
  showLab,
  showIv,
  showPeptides,
  cart,
  cartTotal,
  labProducts,
  ivProducts,
  search,
  activeProductCount,
  cartVertical,
  onSearch,
  onClose,
  onOpenDetail,
  onAdd,
  onRemove,
  onConfirm,
  isConfirming,
  sellerName,
  peptideSlots,
  selectedPeptideSlot,
  peptideSlotsLoading,
  peptideSlotsError,
  peptideBooking,
  isBookingPeptideConsult,
  onSelectPeptideSlot,
  onBookConsult,
}: {
  customer: Customer;
  tab: OrderTab;
  onTabChange: (tab: OrderTab) => void;
  showLab: boolean;
  showIv: boolean;
  showPeptides: boolean;
  cart: Product[];
  cartTotal: number;
  labProducts: Product[];
  ivProducts: Product[];
  search: string;
  activeProductCount: number;
  cartVertical: Product["vertical"] | null;
  onSearch: (value: string) => void;
  onClose: () => void;
  onOpenDetail: (product: Product) => void;
  onAdd: (product: Product) => void;
  onRemove: (index: number) => void;
  onConfirm: () => void;
  isConfirming: boolean;
  sellerName: string;
  peptideSlots: PeptideConsultSlot[];
  selectedPeptideSlot: PeptideConsultSlot | null;
  peptideSlotsLoading: boolean;
  peptideSlotsError: string;
  peptideBooking: PeptideConsultBooking | null;
  isBookingPeptideConsult: boolean;
  onSelectPeptideSlot: (slot: PeptideConsultSlot) => void;
  onBookConsult: () => void;
}) {
  const query = search.trim().toLowerCase();
  const filterProducts = (products: Product[]) =>
    query
      ? products.filter((product) =>
          [product.name, product.desc, product.tat, product.sample]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
      : products;
  const filteredLabProducts = filterProducts(labProducts);
  const filteredIvProducts = filterProducts(ivProducts);
  const resultCount =
    tab === "lab" ? filteredLabProducts.length : tab === "iv" ? filteredIvProducts.length : 0;
  const lockedOutVertical =
    cartVertical && ((showLab && cartVertical !== "Lab") || (showIv && cartVertical !== "IV"))
      ? cartVertical
      : null;
  const addDisabledReason = lockedOutVertical
    ? `Remove ${lockedOutVertical} items before adding ${lockedOutVertical === "Lab" ? "IV" : "Lab"}.`
    : "";

  return (
    <ModalShell width="1080px">
      <div className="pls-modal-head">
        <ModalHeader
          kicker="New order"
          title={customer.name}
          copy=""
          onClose={onClose}
        />
      </div>
      <div className="pls-order-body">
        <div className="pls-tabs">
          {(["lab", "iv", "peptides"] as const).map((item) => (
            <button
              className={tab === item ? "active" : ""}
              key={item}
              onClick={() => onTabChange(item)}
            >
              {item === "iv"
                ? "IV"
                : item === "lab"
                  ? "Lab"
                  : "Peptides"}
            </button>
          ))}
        </div>

        <div className="pls-order-layout">
          <div className="pls-catalog-pane">
            {!showPeptides && (
              <label className="pls-product-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => onSearch(event.target.value)}
                  placeholder={`Search ${activeProductCount.toLocaleString()} ${tab === "lab" ? "lab packages" : "IV therapies"}`}
                />
                {search && (
                  <button onClick={() => onSearch("")} aria-label="Clear product search">
                    <X size={15} />
                  </button>
                )}
              </label>
            )}

            {showLab && (
              <ProductSection
                title="Lab tests"
                products={filteredLabProducts}
                resultCount={resultCount}
                emptyCopy="No lab packages match this search."
                addDisabledReason={addDisabledReason}
                onOpenDetail={onOpenDetail}
                onAdd={onAdd}
              />
            )}

            {showIv && (
              <ProductSection
                title="IV therapy"
                products={filteredIvProducts}
                resultCount={resultCount}
                emptyCopy="No IV therapies match this search."
                addDisabledReason={addDisabledReason}
                onOpenDetail={onOpenDetail}
                onAdd={onAdd}
              />
            )}

            {showPeptides && (
              <section className="pls-peptide">
                <div>
                  <h3>Book a peptide consultation</h3>
                  <p>
                    Tagged with your seller name so it surfaces on the Rx dashboard.
                    When your customer buys a peptide after the consult, you earn
                    20%.
                  </p>
                  <span>
                    <Tag size={13} />
                    Tag: {sellerName}
                  </span>
                  {peptideBooking ? (
                    <p className="pls-peptide-status">
                      Consultation booked for{" "}
                      {formatSlotDay(
                        peptideBooking.consultation?.scheduled_start_at ??
                          peptideBooking.consultation?.slot_start_ts ??
                          selectedPeptideSlot?.slot_start ??
                          "",
                      )}{" "}
                      {formatSlotTime(
                        peptideBooking.consultation?.scheduled_start_at ??
                          peptideBooking.consultation?.slot_start_ts ??
                          selectedPeptideSlot?.slot_start ??
                          "",
                      )}
                    </p>
                  ) : peptideSlotsLoading ? (
                    <p className="pls-peptide-status">Loading peptide consult slots...</p>
                  ) : peptideSlotsError ? (
                    <p className="pls-peptide-error">Could not load slots. {peptideSlotsError}</p>
                  ) : peptideSlots.length === 0 ? (
                    <p className="pls-peptide-status">No peptide consult slots are available right now.</p>
                  ) : (
                    <div className="pls-peptide-slots" aria-label="Available peptide consultation slots">
                      {peptideSlots.slice(0, 8).map((slot) => {
                        const selected = selectedPeptideSlot?.slot_start === slot.slot_start;
                        return (
                          <button
                            type="button"
                            key={slot.slot_start}
                            className={selected ? "active" : ""}
                            onClick={() => onSelectPeptideSlot(slot)}
                          >
                            <CalendarDays size={14} />
                            <span>
                              {formatSlotDay(slot.slot_start)}
                              <small>{formatSlotTime(slot.slot_start)}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  className="pls-peptide-book"
                  disabled={!selectedPeptideSlot || peptideSlotsLoading || isBookingPeptideConsult || Boolean(peptideBooking)}
                  onClick={onBookConsult}
                >
                  {isBookingPeptideConsult ? "Booking..." : "Book consultation"}
                </button>
              </section>
            )}
          </div>

          {!showPeptides && (
            <aside className="pls-cart" aria-label="Selected order items">
              <div className="pls-cart-head">
                <div className="pls-section-label">Selection</div>
                <span>{cart.length} item{cart.length === 1 ? "" : "s"}</span>
              </div>
              {cartVertical && (
                <div className="pls-cart-rule">
                  {cartVertical} order. Remove selected items to switch.
                </div>
              )}
              {cart.length === 0 ? (
                <div className="pls-cart-empty">Add lab tests or IV therapy here.</div>
              ) : (
                <div className="pls-cart-list">
                  {cart.map((item, index) => (
                    <div className="pls-cart-row" key={`${item.name}-${index}`}>
                      <span>{item.name}</span>
                      <span>AED {item.price}</span>
                      <button onClick={() => onRemove(index)} aria-label="Remove item">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="pls-cart-footer">
                <span>
                  Total <em>|</em> AED {cartTotal.toLocaleString()}
                </span>
                <button className="pls-cta" onClick={onConfirm} disabled={cart.length === 0 || isConfirming}>
                  {isConfirming ? "Opening checkout..." : "Checkout"}
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function ProductSection({
  title,
  products,
  resultCount,
  emptyCopy,
  addDisabledReason,
  onOpenDetail,
  onAdd,
}: {
  title: string;
  products: Product[];
  resultCount: number;
  emptyCopy: string;
  addDisabledReason: string;
  onOpenDetail: (product: Product) => void;
  onAdd: (product: Product) => void;
}) {
  return (
    <section className="pls-products">
      <div className="pls-section-label">
        {title} <span>{resultCount.toLocaleString()}</span>
      </div>
      <div className="pls-product-list">
        {products.length === 0 && <div className="pls-product-empty">{emptyCopy}</div>}
        {products.map((product) => (
          <article className="pls-product-row" key={product.name}>
            <button onClick={() => onOpenDetail(product)}>
              <h3>
                {product.name}
                {product.pregnancy && <span>Pregnancy caution</span>}
              </h3>
              <p>{product.desc}</p>
              <span className="pls-detail-link">
                View details <ChevronRight size={13} />
              </span>
            </button>
            <div className="pls-product-buy">
              <span>AED {product.price}</span>
              <button
                onClick={() => onAdd(product)}
                disabled={Boolean(addDisabledReason)}
                title={addDisabledReason || undefined}
              >
                Add
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDetailModal({
  product,
  addDisabledReason,
  onClose,
  onAdd,
}: {
  product: Product;
  addDisabledReason: string;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <ModalShell width="600px" elevated>
      <div className="pls-modal-head">
        <ModalHeader
          kicker={product.vertical}
          title={product.name}
          copy={product.desc}
          onClose={onClose}
        />
      </div>
      <div className="pls-detail-body">
        {product.pregnancy && (
          <div className="pls-warning">
            <AlertTriangle size={20} />
            <div>
              <strong>Not suitable for pregnant women</strong>
              <p>
                Do not administer if the customer is pregnant or breastfeeding.
                Confirm before booking.
              </p>
            </div>
          </div>
        )}

        {product.vertical === "Lab" && (
          <>
            <div className="pls-detail-list">
              <DetailRow label="Type" value="Package" />
              <DetailRow label="Turnaround" value={product.tat ?? "-"} />
              <DetailRow label="Sample" value={product.sample ?? "-"} />
            </div>
            <BiomarkerSection biomarkers={product.biomarkers ?? []} />
          </>
        )}

        {product.vertical === "IV" && (
          <>
            <div className="pls-detail-list">
              <DetailRow label="Duration" value={product.duration ?? "-"} />
            </div>
            <div className="pls-detail-section">
              <div className="pls-section-label">
                Ingredients <span>{product.ingredients?.length ?? 0}</span>
              </div>
              <div className="pls-ingredients">
                {product.ingredients?.map((ingredient) => (
                  <IngredientRow
                    key={ingredient.name}
                    name={ingredient.name}
                    desc={ingredient.desc}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="pls-detail-footer">
        <div className="pls-detail-price">
          <span>Price</span>
          <strong>AED {product.price}</strong>
        </div>
        {addDisabledReason && (
          <span className="pls-detail-rule">{addDisabledReason}</span>
        )}
        <button className="pls-cta" onClick={onAdd} disabled={Boolean(addDisabledReason)}>
          Add to order
        </button>
      </div>
    </ModalShell>
  );
}

function BiomarkerSection({ biomarkers }: { biomarkers: string[] }) {
  if (!biomarkers.length) return null;

  return (
    <div className="pls-detail-section">
      <div className="pls-section-label">
        Biomarkers <span>{biomarkers.length}</span>
      </div>
      <div className="pls-biomarkers">
        {biomarkers.map((biomarker) => (
          <span key={biomarker}>{biomarker}</span>
        ))}
      </div>
    </div>
  );
}

function IngredientRow({ name, desc }: { name: string; desc: string }) {
  const cleanedDesc = desc.trim().toLowerCase() === "included" ? "" : desc;

  return (
    <div className="pls-ingredient-row">
      <span>{name}</span>
      {cleanedDesc && <em>{cleanedDesc}</em>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="pls-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModalShell({
  children,
  width,
  elevated = false,
}: {
  children: ReactNode;
  width: string;
  elevated?: boolean;
}) {
  return (
    <div className={`pls-overlay ${elevated ? "top" : ""}`}>
      <div className="pls-sheet" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  kicker,
  title,
  copy,
  onClose,
}: {
  kicker: string;
  title: string;
  copy: string;
  onClose: () => void;
}) {
  return (
    <div className="pls-modal-title-row">
      <div>
        {kicker && <div className="pls-section-label">{kicker}</div>}
        <h2>{title}</h2>
        {copy && <p>{copy}</p>}
      </div>
      <button className="pls-icon-btn" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <div className="pls-field-label">{label}</div>;
}
