/**
 * Item groups for PR lines and rate-contract rates, from the SOP's definition of Routine
 * Consumables (§VI, "Definition and Scope of Routine Consumables"). A rate contract covers the
 * groups of its rate lines; per §VII.5, an active contract for a group takes precedence over
 * direct-purchase (small value) limits.
 */
export const ITEM_GROUPS = [
  {
    id: "stationery",
    label: "Stationery & Office Supplies",
    examples: "paper, pens, files, staplers, markers",
  },
  {
    id: "printing",
    label: "Printing & Reprographics",
    examples: "toner, cartridges, photocopier paper",
  },
  {
    id: "housekeeping",
    label: "Housekeeping & Sanitation",
    examples: "cleaning chemicals, mops, garbage bags",
  },
  {
    id: "pantry",
    label: "Pantry & Cafeteria Supplies",
    examples: "tea, coffee, disposable cups, water refills",
  },
  { id: "lab", label: "Laboratory Consumables", examples: "reagents, gloves, test tubes, slides" },
  {
    id: "it_electrical",
    label: "IT & Electrical Consumables",
    examples: "USB drives, cables, bulbs, batteries",
  },
  {
    id: "maintenance",
    label: "Maintenance Consumables",
    examples: "fasteners, lubricants, sealant, touch-up paint",
  },
  {
    id: "first_aid",
    label: "First Aid & Safety Supplies",
    examples: "band aids, antiseptic, masks",
  },
  {
    id: "academic",
    label: "Academic Consumables",
    examples: "chalk, whiteboard markers, chart paper",
  },
  {
    id: "not_consumable",
    label: "Not a routine consumable",
    examples: "equipment, repairs, one-off items",
  },
] as const;

export type ItemGroupId = (typeof ITEM_GROUPS)[number]["id"];

export const itemGroupLabel = (id?: string | null) =>
  ITEM_GROUPS.find((g) => g.id === id)?.label ?? "Group not set";

/** Rate-contract shape we need: validity window and its rate lines (each tagged with a group). */
type RateContract = {
  contract_number: string;
  valid_from: string;
  valid_to: string;
  approved_rates_json: Array<{ group?: string | null }> | null;
};

/**
 * For each requested group, the active rate contract (if any) that covers it.
 * `not_consumable` and untagged rate lines never match. Pure — used by server and tests.
 */
export function coveringContracts(groups: string[], contracts: RateContract[], today: string) {
  const active = contracts.filter((c) => c.valid_from <= today && c.valid_to >= today);
  const result: Record<string, { contract_number: string; valid_to: string }> = {};
  for (const g of new Set(groups)) {
    if (!g || g === "not_consumable") continue;
    const rc = active.find((c) => (c.approved_rates_json ?? []).some((r) => r?.group === g));
    if (rc) result[g] = { contract_number: rc.contract_number, valid_to: rc.valid_to };
  }
  return result;
}
