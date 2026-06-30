"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Info,
  LogOut,
  Search,
  Settings,
  Tag,
  UserRound,
  X,
} from "lucide-react";

type View = "customers" | "bookings" | "revenue" | "settings";
type Gender = "Female" | "Male";
type OrderTab = "lab" | "iv" | "peptides";
type BookingFilter = "All" | Booking["vertical"];

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
  type?: "booking" | "peptide_consultation" | "peptide_medication_order" | string;
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

type PremiseAddress = {
  saved_name: string;
  line1: string;
  building_name: string;
  floor_number: string;
  line2: string;
  area: string;
  city: string;
  emirate: string;
  country: string;
  latitude: string;
  longitude: string;
};

type PartnerContext = {
  seller_id: string;
  customer_id: string;
  seller?: {
    display_name?: string | null;
  };
  resolved_by?: string | null;
};

type PulseSettingsPayload = {
  pulseProfile?: {
    serves_on_premise?: boolean;
    premise_address?:
      | (Partial<PremiseAddress> & {
          address?: string | null;
          detail?: string | null;
        })
      | null;
  };
  error?: string;
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

const emptyPremiseAddress: PremiseAddress = {
  saved_name: "Premise",
  line1: "",
  building_name: "",
  floor_number: "",
  line2: "",
  area: "",
  city: "Dubai",
  emirate: "Dubai",
  country: "UAE",
  latitude: "",
  longitude: "",
};

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

function formatSlotDate(value: string) {
  const date = new Date(`${value}T00:00:00+04:00`);
  if (Number.isNaN(date.getTime())) return "Available";
  return new Intl.DateTimeFormat("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function normalizePremiseAddress(
  value:
    | (Partial<PremiseAddress> & {
        address?: string | null;
        detail?: string | null;
      })
    | null
    | undefined,
): PremiseAddress {
  if (!value) return emptyPremiseAddress;
  return {
    saved_name: String(value.saved_name ?? emptyPremiseAddress.saved_name),
    line1: String(value.line1 ?? value.address ?? ""),
    building_name: String(value.building_name ?? ""),
    floor_number: String(value.floor_number ?? ""),
    line2: String(value.line2 ?? value.detail ?? ""),
    area: String(value.area ?? ""),
    city: String(value.city ?? emptyPremiseAddress.city),
    emirate: String(value.emirate ?? emptyPremiseAddress.emirate),
    country: String(value.country ?? emptyPremiseAddress.country),
    latitude: String(value.latitude ?? ""),
    longitude: String(value.longitude ?? ""),
  };
}

function validatePremiseAddress(address: PremiseAddress) {
  if (!address.line1.trim()) return "Address line is required.";
  if (!address.area.trim()) return "Area is required.";
  if (!address.city.trim()) return "City is required.";
  if (!address.emirate.trim()) return "Emirate is required.";
  if (!address.country.trim()) return "Country is required.";
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Enter a valid latitude.";
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Enter a valid longitude.";
  }
  return "";
}

export default function Home() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
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
  const [signingOut, setSigningOut] = useState(false);
  const [liveLabProducts, setLiveLabProducts] = useState<Product[]>([]);
  const [liveIvProducts, setLiveIvProducts] = useState<Product[]>([]);
  const [servesPremise, setServesPremise] = useState(true);
  const [premiseAddress, setPremiseAddress] = useState<PremiseAddress>(emptyPremiseAddress);
  const [savingSettings, setSavingSettings] = useState(false);
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
        const [
          contextResponse,
          customersResponse,
          catalogResponse,
          bookingsResponse,
          ledgerResponse,
          settingsResponse,
        ] =
          await Promise.all([
            fetch("/api/pulse/context", { cache: "no-store", headers }),
            fetch("/api/pulse/customers", { cache: "no-store", headers }),
            fetch("/api/pulse/catalog", { cache: "no-store", headers }),
            fetch("/api/pulse/bookings", { cache: "no-store", headers }),
            fetch("/api/pulse/ledger", { cache: "no-store", headers }),
            fetch("/api/pulse/settings", { cache: "no-store", headers }),
          ]);

        const [
          contextPayload,
          customersPayload,
          catalogPayload,
          bookingsPayload,
          ledgerPayload,
          settingsPayload,
        ] =
          await Promise.all([
            contextResponse.json(),
            customersResponse.json(),
            catalogResponse.json(),
            bookingsResponse.json(),
            ledgerResponse.json(),
            settingsResponse.json() as Promise<PulseSettingsPayload>,
          ]);

        const failed = [
          contextResponse,
          customersResponse,
          catalogResponse,
          bookingsResponse,
          ledgerResponse,
          settingsResponse,
        ].find((response) => !response.ok);

        if (failed) {
          throw new Error(
            contextPayload.error ??
              customersPayload.error ??
              catalogPayload.error ??
              bookingsPayload.error ??
              ledgerPayload.error ??
              settingsPayload.error ??
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
        setServesPremise(Boolean(settingsPayload.pulseProfile?.serves_on_premise));
        setPremiseAddress(normalizePremiseAddress(settingsPayload.pulseProfile?.premise_address));
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

  async function saveSettings() {
    if (savingSettings) return;
    const validationError = servesPremise ? validatePremiseAddress(premiseAddress) : "";
    if (validationError) {
      flash(validationError);
      return;
    }

    setSavingSettings(true);
    try {
      const response = await fetch("/api/pulse/settings", {
        method: "PATCH",
        headers: await authHeaders("application/json"),
        body: JSON.stringify({
          serves_on_premise: servesPremise,
          premise_address: servesPremise ? premiseAddress : null,
        }),
      });
      const payload = (await response.json()) as PulseSettingsPayload;
      if (!response.ok || !payload.pulseProfile) {
        throw new Error(payload.error ?? `settings_save_${response.status}`);
      }
      setServesPremise(Boolean(payload.pulseProfile.serves_on_premise));
      setPremiseAddress(normalizePremiseAddress(payload.pulseProfile.premise_address));
      flash("Premise address saved.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Settings save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  function resetPeptideConsult() {
    setPeptideSlots([]);
    setSelectedPeptideSlot(null);
    setPeptideSlotsError("");
    setPeptideSlotsLoading(false);
    setPeptideBooking(null);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (error) {
      setSigningOut(false);
      flash(error instanceof Error ? error.message : "Sign out failed.");
    }
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
      <Sidebar
        activeView={view}
        sellerName={sellerName}
        signingOut={signingOut}
        onChange={changeView}
        onSignOut={handleSignOut}
      />

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
            premiseAddress={premiseAddress}
            saving={savingSettings}
            onServesPremise={setServesPremise}
            onPremiseAddress={setPremiseAddress}
            onSave={saveSettings}
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
  signingOut,
  onChange,
  onSignOut,
}: {
  activeView: View;
  sellerName: string;
  signingOut: boolean;
  onChange: (view: View) => void;
  onSignOut: () => void;
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
      <button className="pls-logout" type="button" onClick={onSignOut} disabled={signingOut}>
        <LogOut size={17} />
        {signingOut ? "Signing out..." : "Log out"}
      </button>
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
  const [filter, setFilter] = useState<BookingFilter>("All");
  const filteredBookings =
    filter === "All" ? bookings : bookings.filter((booking) => booking.vertical === filter);
  const filterOptions: BookingFilter[] = ["All", "Lab", "IV", "Peptides"];

  return (
    <>
      <h1>Bookings</h1>
      <p className="pls-page-copy">Everything you have booked for your customers.</p>

      <div className="pls-booking-filters" aria-label="Booking filters">
        {filterOptions.map((option) => {
          const count =
            option === "All"
              ? bookings.length
              : bookings.filter((booking) => booking.vertical === option).length;
          return (
            <button
              type="button"
              key={option}
              className={filter === option ? "active" : ""}
              onClick={() => setFilter(option)}
            >
              {option}
              <span>{count}</span>
            </button>
          );
        })}
      </div>

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
        {!loading && !error && bookings.length > 0 && filteredBookings.length === 0 && (
          <EmptyState copy={`No ${filter.toLowerCase()} bookings in the latest seller bookings.`} />
        )}
        {filteredBookings.map((booking) => (
          <div className="pls-booking-row" key={`${booking.id}-${booking.service}`}>
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
  premiseAddress,
  saving,
  onServesPremise,
  onPremiseAddress,
  onSave,
}: {
  servesPremise: boolean;
  premiseAddress: PremiseAddress;
  saving: boolean;
  onServesPremise: (value: boolean) => void;
  onPremiseAddress: (value: PremiseAddress) => void;
  onSave: () => void;
}) {
  const updateAddress = (patch: Partial<PremiseAddress>) => {
    onPremiseAddress({ ...premiseAddress, ...patch });
  };

  return (
    <>
      <h1>Settings</h1>
      <p className="pls-page-copy">
        Manage how Pulse creates members and visit addresses for this seller.
      </p>

      <section className="pls-settings-card">
        <div>
          <h2>Premise address</h2>
          <p>
            Save the location used when new customers and members are created from Pulse.
          </p>
        </div>
        <div className="pls-settings-stack">
          <div className="pls-premise-grid">
            <button
              type="button"
              className={`pls-premise ${servesPremise ? "active" : ""}`}
              onClick={() => onServesPremise(true)}
            >
              Serves on premise
              {servesPremise && <Check size={18} />}
            </button>
            <button
              type="button"
              className={`pls-premise ${!servesPremise ? "active" : ""}`}
              onClick={() => onServesPremise(false)}
            >
              Home visit only
              {!servesPremise && <Check size={18} />}
            </button>
          </div>

          {servesPremise && (
            <div className="pls-address-form">
              <div className="pls-form-grid">
                <SettingsField
                  label="Label"
                  value={premiseAddress.saved_name}
                  placeholder="Clinic, Gym, Studio"
                  onChange={(value) => updateAddress({ saved_name: value })}
                />
                <SettingsField
                  label="Building"
                  value={premiseAddress.building_name}
                  placeholder="Building or venue"
                  onChange={(value) => updateAddress({ building_name: value })}
                />
              </div>
              <SettingsField
                label="Address line"
                value={premiseAddress.line1}
                placeholder="Street, tower, villa, or venue address"
                onChange={(value) => updateAddress({ line1: value })}
              />
              <div className="pls-form-grid">
                <SettingsField
                  label="Floor / unit"
                  value={premiseAddress.floor_number}
                  placeholder="Floor 12, Unit 1204"
                  onChange={(value) => updateAddress({ floor_number: value })}
                />
                <SettingsField
                  label="Details"
                  value={premiseAddress.line2}
                  placeholder="Reception, landmark, parking"
                  onChange={(value) => updateAddress({ line2: value })}
                />
              </div>
              <div className="pls-form-grid">
                <SettingsField
                  label="Area"
                  value={premiseAddress.area}
                  placeholder="Dubai Marina"
                  onChange={(value) => updateAddress({ area: value })}
                />
                <SettingsField
                  label="City"
                  value={premiseAddress.city}
                  placeholder="Dubai"
                  onChange={(value) => updateAddress({ city: value })}
                />
              </div>
              <div className="pls-form-grid">
                <SettingsField
                  label="Emirate"
                  value={premiseAddress.emirate}
                  placeholder="Dubai"
                  onChange={(value) => updateAddress({ emirate: value })}
                />
                <SettingsField
                  label="Country"
                  value={premiseAddress.country}
                  placeholder="UAE"
                  onChange={(value) => updateAddress({ country: value })}
                />
              </div>
              <div className="pls-form-grid">
                <SettingsField
                  label="Latitude"
                  value={premiseAddress.latitude}
                  placeholder="25.2048"
                  inputMode="decimal"
                  onChange={(value) => updateAddress({ latitude: value })}
                />
                <SettingsField
                  label="Longitude"
                  value={premiseAddress.longitude}
                  placeholder="55.2708"
                  inputMode="decimal"
                  onChange={(value) => updateAddress({ longitude: value })}
                />
              </div>
              <p className="pls-settings-note">
                Coordinates are required so checkout can validate serviceability and show slots.
              </p>
            </div>
          )}

          <div className="pls-settings-actions">
            <button type="button" className="pls-primary-wide" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function SettingsField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "text" | "decimal";
  onChange: (value: string) => void;
}) {
  return (
    <label className="pls-settings-field">
      <span>{label}</span>
      <input
        className="pls-input"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
          type="tel"
          inputMode="tel"
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
  const peptideSlotGroups = useMemo(() => {
    const groups = new Map<string, PeptideConsultSlot[]>();
    peptideSlots.forEach((slot) => {
      const [date] = slot.slot_start.split("T");
      if (!date) return;
      groups.set(date, [...(groups.get(date) ?? []), slot]);
    });

    return Array.from(groups, ([date, slots]) => ({
      date,
      slots: [...slots].sort((a, b) => a.slot_start.localeCompare(b.slot_start)),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [peptideSlots]);
  const selectedPeptideDate =
    selectedPeptideSlot?.slot_start.split("T")[0] ?? peptideSlotGroups[0]?.date ?? "";
  const visiblePeptideSlots =
    peptideSlotGroups.find((group) => group.date === selectedPeptideDate)?.slots ??
    peptideSlotGroups[0]?.slots ??
    [];
  const bookedPeptideSlot =
    peptideBooking?.consultation?.scheduled_start_at ??
    peptideBooking?.consultation?.slot_start_ts ??
    selectedPeptideSlot?.slot_start ??
    "";

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
                <div className="pls-peptide-intro">
                  <h3>Book a peptide consultation</h3>
                  <p>
                    Tagged with your seller name so it surfaces on the Rx dashboard.
                    When your customer buys a peptide after the consult, you earn
                    20%.
                  </p>
                  <span className="pls-peptide-tag">
                    <Tag size={13} />
                    Tag: {sellerName}
                  </span>
                </div>
                {peptideBooking ? (
                  <p className="pls-peptide-status">
                    Consultation booked for {formatSlotDay(bookedPeptideSlot)}{" "}
                    {formatSlotTime(bookedPeptideSlot)}
                  </p>
                ) : peptideSlotsLoading ? (
                  <p className="pls-peptide-status">Loading peptide consult slots...</p>
                ) : peptideSlotsError ? (
                  <p className="pls-peptide-error">Could not load slots. {peptideSlotsError}</p>
                ) : peptideSlotGroups.length === 0 ? (
                  <p className="pls-peptide-status">No peptide consult slots are available right now.</p>
                ) : (
                  <div className="pls-peptide-scheduler">
                    <div className="pls-peptide-dates" aria-label="Available consultation dates">
                      {peptideSlotGroups.map((group) => {
                        const selected = group.date === selectedPeptideDate;
                        return (
                          <button
                            type="button"
                            key={group.date}
                            className={selected ? "active" : ""}
                            onClick={() => onSelectPeptideSlot(group.slots[0])}
                          >
                            <CalendarDays size={15} />
                            <span>
                              {formatSlotDate(group.date)}
                              <small>{group.slots.length} slot{group.slots.length === 1 ? "" : "s"}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="pls-peptide-slots" aria-label="Available consultation times">
                      {visiblePeptideSlots.map((slot) => {
                        const selected = selectedPeptideSlot?.slot_start === slot.slot_start;
                        return (
                          <button
                            type="button"
                            key={slot.slot_start}
                            className={selected ? "active" : ""}
                            onClick={() => onSelectPeptideSlot(slot)}
                          >
                            {formatSlotTime(slot.slot_start)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pls-peptide-actions">
                      <div>
                        <span>Selected time</span>
                        <strong>
                          {selectedPeptideSlot
                            ? `${formatSlotDay(selectedPeptideSlot.slot_start)} ${formatSlotTime(
                                selectedPeptideSlot.slot_start,
                              )}`
                            : "Choose a slot"}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="pls-peptide-book"
                        disabled={!selectedPeptideSlot || isBookingPeptideConsult}
                        onClick={onBookConsult}
                      >
                        {isBookingPeptideConsult ? "Booking..." : "Book consultation"}
                      </button>
                    </div>
                  </div>
                )}
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
