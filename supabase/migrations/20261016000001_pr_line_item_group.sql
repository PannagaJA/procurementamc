-- SOP item group per PR line (see src/lib/procurement/itemGroups.ts). Used to decide whether a
-- line is covered by an active rate contract (SOP §VII.5): covered groups can't be bought as a
-- small-value direct purchase. Rate-contract lines carry the same key inside approved_rates_json.
-- Additive and nullable: existing PR lines keep working ("group not set").
alter table public.pr_line_items add column if not exists item_group text;
