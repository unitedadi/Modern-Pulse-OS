import { NextResponse } from "next/server";
import { backendError, filsToAed, readJson, sellerUrl } from "../backend";

type BackendProduct = {
  product_id: string;
  vertical_id: string;
  name: string;
  product_type?: string | null;
  type?: string | null;
  base_name?: string | null;
  price_aed_fils?: number | null;
  attributes_json?: Record<string, unknown> | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function boolValue(value: unknown) {
  return value === true || value === "true";
}

function ingredientList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = objectValue(item);
      const name = stringValue(row.name);
      if (!name) return null;
      return { name, desc: stringValue(row.desc ?? row.description, "Included") };
    })
    .filter((item): item is { name: string; desc: string } => item !== null);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item) => item.length > 0);
}

function biomarkerList(lab: Record<string, unknown>, attrs: Record<string, unknown>) {
  const namesFromObjects = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => stringValue(objectValue(item).name))
      .filter((item) => item.length > 0);
  };

  const groups = Array.isArray(lab.biomarker_groups) ? lab.biomarker_groups : [];
  const groupedNames = groups.flatMap((group) =>
    stringList(objectValue(group).biomarkers),
  );

  const labNames = Array.from(
    new Set([
      ...stringList(lab.biomarkers_full),
      ...namesFromObjects(lab.biomarkers_v2),
      ...stringList(lab.biomarkers),
      ...groupedNames,
    ]),
  );
  if (labNames.length) return labNames;

  return Array.from(
    new Set([...stringList(attrs.biomarkers), ...namesFromObjects(attrs.biomarkers_v2)]),
  );
}

function labProduct(product: BackendProduct) {
  const attrs = objectValue(product.attributes_json);
  const lab = objectValue(attrs.lab ?? attrs.Lab);
  const price = filsToAed(product.price_aed_fils) || filsToAed(objectValue(lab.pricing).price_aed_fils);
  const tat = stringValue(lab.tat_display ?? lab.tat ?? lab.turnaround, "Turnaround varies");
  const sample = stringValue(lab.sample_type ?? lab.sample, "Sample collected by nurse");

  return {
    productId: product.product_id,
    backendVerticalId: product.vertical_id,
    name: product.name,
    productType: "PACKAGE" as const,
    desc: `${tat}. ${sample}.`,
    price,
    vertical: "Lab" as const,
    fasting: boolValue(lab.fasting_required ?? lab.fasting),
    tat,
    sample,
    biomarkers: biomarkerList(lab, attrs),
  };
}

function isLabPackage(product: BackendProduct) {
  const attrs = objectValue(product.attributes_json);
  const lab = objectValue(attrs.lab ?? attrs.Lab);
  const type = stringValue(product.product_type ?? product.type ?? lab.kind);
  return type.toUpperCase() === "PACKAGE";
}

function ivProduct(product: BackendProduct) {
  const attrs = objectValue(product.attributes_json);
  const iv = objectValue(attrs.IV ?? attrs.iv ?? attrs.iv_drip);
  const durationMinutes = Number(iv.serviceTime ?? iv.service_time_minutes ?? iv.duration_minutes);
  let ingredients = ingredientList(iv.display_ingredients);
  if (!ingredients.length) ingredients = ingredientList(iv.ingredients);
  if (!ingredients.length) ingredients = ingredientList(iv.ivIngredients);

  return {
    productId: product.product_id,
    backendVerticalId: product.vertical_id,
    name: product.name,
    desc: stringValue(iv.subtitle ?? iv.tagline ?? iv.description, "IV therapy"),
    price: filsToAed(product.price_aed_fils),
    vertical: "IV" as const,
    duration: Number.isFinite(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} min` : "45 min",
    pregnancy: boolValue(iv.pregnancy_caution ?? iv.pregnancy_warning),
    ingredients: ingredients.length ? ingredients : [{ name: "Formula", desc: "See backend catalog" }],
  };
}

export async function GET() {
  const response = await fetch(sellerUrl("/catalog"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | {
        products?: {
          laboratory?: BackendProduct[];
          iv_drips?: BackendProduct[];
        };
        peptide_consultation?: unknown;
        error?: string;
        detail?: string;
      }
    | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: backendError(payload, `catalog_${response.status}`) },
      { status: response.status },
    );
  }

  return NextResponse.json({
    labProducts: (payload?.products?.laboratory ?? []).filter(isLabPackage).map(labProduct),
    ivProducts: (payload?.products?.iv_drips ?? []).slice(0, 24).map(ivProduct),
    peptideConsultation: payload?.peptide_consultation ?? null,
  });
}
