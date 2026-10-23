# P2P QA test suite (Stalight SOP)

Atomic manual test cases for the Procure-to-Pay system, written against `main` at #46 (2026-10-23).
Each case checks **one** behaviour, lists its own preconditions, and has one expected result.
Expected results follow the SOP / product decisions; where code review says the app probably
behaves differently, the case is marked **⚠ Suspect** with what to look for, so a failure there is
a confirmed defect, not a test error.

## 0. How to use this suite

**Start state.** Run the reset (`scripts/qa/README.md`), then `TC-SET` and `TC-BUD` setup cases in
order. After that every case can run on its own once its fixtures (section 0.4) exist.

**Legend.** `P1` must pass for release · `P2` important · `P3` nice to have.
`POS` positive · `NEG` negative · `EDGE` boundary/edge · `SEC` security/access · `⏱` needs a past or
future date (set it in the data, e.g. an RFQ deadline in the past).
Amounts are rupees. "API" means calling the server function directly (browser devtools or a
script), used where the UI hides the path.

### 0.1 Live configuration the cases assume

Authority matrix (`approval_matrix_rules`), limits inclusive:

| Category | Approver | Per transaction | Per month | Method |
|---|---|---|---|---|
| small_value | HOD | ≤ 2,000 | ≤ 5,000 | direct purchase |
| small_value | Principal **or** Procurement Officer | ≤ 5,000 | ≤ 30,000 | small value PO |
| routine_consumable | Procurement Officer | — | ≤ 1,00,000 | rate contract (3 quotes) |
| equipment_asset, software, academic_research, services_amc, maintenance | Purchase Committee | ≤ 10,000 | ≤ 50,000 | comparative quotations (3) |
| anything above the top band / no rule | EVP | | | |

Match tolerance `{abs: 500, pct: 0.01}` → EVP deviation allowed up to max(500, 1% of limit).
Emergency annual cap ₹10,00,000 per Indian FY (Apr–Mar). Rate contract validity ≤ 6 months.
Budget tolerance ₹1 (`amount > balance + 1` is over budget).

### 0.2 Test accounts

| Alias | Role | Name | Login |
|---|---|---|---|
| ADM | admin | Dr. System Administrator | admin@institution.edu |
| FAC-CSE | user (faculty) · CSE | Dr. Ananya Roy | faculty.cse@institution.edu |
| FAC-ME | faculty · Mechanical | Dr Likith | likith.mech@institution.edu |
| FAC-ME2 | faculty · Mechanical | Dr sowmya | faculty.mech@institution.edu |
| HOD-CSE | hod · CSE | Prof. Vikram Seth | hod.cse@institution.edu |
| HOD-ME | hod · Mechanical | Prof. Ramesh Gupta | hod.mech@institution.edu |
| PRIN | principal (+ legacy `principle`) | Dr. Anand Kumar | principal@institution.edu |
| PO-OFF | procurement_officer | Suresh Menon | procurement.officer@institution.edu |
| PC | purchase_committee | Prof. Sunita Rao | purchase.committee@institution.edu |
| EVP | evp | Dr. Rajesh Sharma | evp@institution.edu |
| FIN | finance | Priya Nambiar | finance@institution.edu |
| STO | stores | Manoj Kumar | stores@institution.edu |
| DIR | director_admin_finance | *create in TC-SET-04* | |
| PEX | procurement_executive | *create in TC-SET-05* | |

### 0.3 Vendors (kept by the reset)

| Alias | Vendor | Status |
|---|---|---|
| V-PRIME | Prime Office Supplies & Stationery | empanelled |
| V-DELL | Dell Technologies India | empanelled |
| V-LEN | Lenovo Enterprise Solutions | empanelled |
| V-APXT | Apex Tech Solutions Pvt Ltd | empanelled |
| V-APXS | Apex Scientific Instuments ltd (the empanelled row) | empanelled |
| V-ARW | arrow electronics | empanelled |
| V-DEB | LUMINEX | debarred |
| V-REJ | Doms stationery | rejected |

### 0.4 Fixtures (reusable preconditions)

Build a fixture by following the referenced positive case. Use a **new** PR for every case that
consumes one, so cases stay independent.

| Fixture | What it is | Built by |
|---|---|---|
| FX-BUDGET | FY 2026-27 heads live: CSE small_value 20,000 · routine_consumable 1,50,000 · equipment_asset 60,000 (no software head). Mechanical (opening budget) small_value 10,000 · equipment_asset 30,000 | BUD-01…BUD-17 |
| FX-PR-SV(x) | Small Value PR for ₹x, CSE, item group stationery, raised by FAC-CSE, **approved** | PR-01 + PR-21 |
| FX-PR-EQ(x) | Equipment PR for ₹x, CSE, group not_consumable, raised by FAC-CSE, approved by PC | 3W-01 |
| FX-PR-RTN(x) | Routine Consumable PR for ₹x, CSE, group stationery, approved by PO-OFF | PR-10 + approve |
| FX-PO-DP | Direct purchase PO from FX-PR-SV(1500) to V-PRIME, **issued** | DP-01, DP-05 |
| FX-RFQ-EQ | FX-PR-EQ(9500) → RFQ sent to V-DELL, V-LEN, V-APXT; quotes 8,500 / 8,800 / 9,200, delivery 10 days, validity deadline+31d | 3W-02…3W-05 |
| FX-PO-EQ | FX-RFQ-EQ → CS (L1 V-DELL 8,500) approved → PO approved and **issued** | 3W-07…3W-11 |
| FX-GRN-FULL | FX-PO-EQ → DC → GRN all quantity accepted (₹8,500) | 3W-12…3W-14 |
| FX-GRN-PART | FX-PO-EQ → DC → GRN accepting 60% (₹5,100) | 3W-19 |
| FX-RC | Rate contract with V-PRIME: A4 paper (stationery) ₹230/ream, Toner 88A (printing) ₹1,750/nos, 6 months from today, **active** | RC-01…RC-18 |

---

## 1. TC-SET — Environment, reset and smoke

**SET-01 · Reset leaves vendors, users and config untouched** `P1 · POS`
Pre: reset script run. Steps: `select count(*)` on vendors, user_roles, departments, approval_matrix_rules.
Expected: 14 vendors, 14 user_roles, 8 departments, 9 matrix rules (same as before reset).

**SET-02 · Reset empties every P2P table** `P1 · POS`
Steps: count purchase_requisitions, purchase_orders, grns, invoices, payments, rate_contracts, budget_heads, emergency_procurements.
Expected: all 0.

**SET-03 · Document numbers restart** `P2 · POS`
Pre: SET-02. Steps: raise any PR (PR-01). Expected: number ends in `-1001`.

**SET-04 · Create a Director (Admin & Finance) test user** `P2 · POS`
Steps: ADM → Admin → Users → create user, role director_admin_finance. Expected: user can log in; nav shows Annual Budgets, My Approvals.

**SET-05 · Create a Procurement Executive test user** `P2 · POS`
Steps: as SET-04, role procurement_executive. Expected: user logs in; sees Procurement Hub, RFQs, POs.

**SET-06 · Emergency ledger starts at zero** `P1 · POS`
Steps: open /procurement/emergency as EVP. Expected: remaining annual headroom ₹10,00,000.

**SET-07 · Sidebar shows the right modules per role** `P2 · POS`
Steps: log in as each account in 0.2. Expected: Raise PR for faculty/HOD/PO-OFF/PC/ADM; Invoices only ADM/FIN; GRNs ADM/STO/HOD/FIN; Vendor Ratings ADM/PC/PO-OFF/PEX/EVP/DIR; Annual Budgets HOD/FIN/PRIN/EVP/DIR/PO-OFF/ADM.

**SET-08 · Vendor quote links are configured** `P1 · POS`
Steps: send any RFQ (3W-03). Expected: no "Vendor links aren't set up on the server yet (QUOTE_LINK_SECRET)…" error.

**SET-09 · Outgoing email works** `P1 · POS`
Steps: send an RFQ to V-PRIME. Expected: invitation arrives at the vendor's address with a private `/quotation/<id>?vendorId=…&token=…` link.

---

## 2. TC-BUD — Budget setup, calculations and ledger (your item 8)

### 2.1 Setup from zero (run in order once; they build FX-BUDGET)

**BUD-01 · HOD saves a draft department budget** `P1 · POS`
Pre: SET-02. Steps: HOD-CSE → Annual Budgets → Department proposal, FY 2026-27, enter small_value 20,000, routine_consumable 1,50,000, equipment_asset 60,000 → Save draft.
Expected: toast "Draft saved"; proposal status draft.

**BUD-02 · HOD sends the budget to Finance** `P1 · POS`
Pre: BUD-01. Steps: Send to Finance. Expected: toast "Budget sent to Finance"; status submitted.

**BUD-03 · Zero budget can't be sent** `P2 · NEG`
Steps: new proposal with all categories 0. Expected: "Send to Finance" disabled; API → "Enter an amount for at least one category."

**BUD-04 · Another department's HOD can't prepare this budget** `P1 · NEG`
Steps: HOD-ME saves a CSE proposal (API). Expected: "Only the department's HOD can prepare its budget."

**BUD-05 · Faculty can't prepare a budget** `P2 · NEG`
Steps: FAC-CSE opens Annual Budgets. Expected: no Department proposal tab; API save rejected.

**BUD-06 · Submitted budget is locked** `P2 · NEG`
Pre: BUD-02. Steps: HOD-CSE edits and saves. Expected: 'This budget is "submitted" and can't be edited now.'

**BUD-07 · Finance consolidates submitted budgets** `P1 · POS`
Pre: BUD-02. Steps: FIN → Finance & EVP → Consolidate. Expected: toast "1 budget(s) sent to the EVP"; status with_evp.

**BUD-08 · Nothing to consolidate** `P3 · NEG`
Pre: BUD-07 done. Steps: Consolidate again. Expected: "No submitted department budgets to consolidate."

**BUD-09 · Only Finance consolidates** `P2 · NEG`
Steps: HOD-CSE calls consolidate (API). Expected: "Only Finance can consolidate budgets."

**BUD-10 · EVP must say why when sending back** `P2 · NEG`
Pre: BUD-07. Steps: EVP → Send back with empty remarks. Expected: "Say what needs to change before sending it back."

**BUD-11 · EVP sends a budget back for rework** `P1 · POS`
Pre: BUD-07. Steps: Send back with remarks "Reduce equipment". Expected: toast "Budget sent back to the HOD"; HOD-CSE sees "Sent back by the EVP: Reduce equipment"; status rework.

**BUD-12 · HOD resubmits after rework** `P1 · POS`
Pre: BUD-11. Steps: HOD-CSE edits (keep 60,000), Send to Finance; FIN consolidates. Expected: status submitted → with_evp.

**BUD-13 · EVP approves; heads go live** `P1 · POS`
Pre: BUD-12. Steps: EVP approves. Expected: toast "Budget approved — its heads are live"; status sanctioned; 3 heads for CSE (small_value, routine_consumable, equipment_asset), code `<dept initials>-<CATEGORY>-202627`, title "<Dept> — <category>".

**BUD-14 · Only the EVP approves budgets** `P1 · NEG`
Steps: FIN calls decide (API). Expected: "Only the EVP can approve budgets."

**BUD-15 · A zero category gets no head** `P2 · EDGE`
Pre: BUD-13. Expected: no CSE software head exists.

**BUD-16 · Finance enters an opening budget** `P1 · POS`
Steps: FIN → Opening budget, Mechanical, small_value 10,000, equipment_asset 30,000 → Save. Expected: toast "Opening budget saved (2 head(s))"; heads source opening.

**BUD-17 · Opening budget can't change EVP-approved heads** `P2 · NEG`
Pre: BUD-13. Steps: FIN opening budget for CSE equipment_asset 99,000. Expected: field greyed; API skips it: "Already approved by the EVP, so not changed: …"; head still 60,000.

**BUD-18 · Empty opening budget rejected** `P3 · NEG`
Steps: save opening budget with all 0. Expected: "Enter an amount for at least one category."

**BUD-19 · Only Finance enters opening budgets** `P2 · NEG`
Steps: HOD-ME calls setOpeningBudget (API). Expected: "Only Finance can enter the opening budget."

**BUD-20 · Opening budget can't reduce a head to zero** `P3 · EDGE`
Pre: BUD-16. Steps: save Mechanical small_value 0. Expected: head unchanged at 10,000.

**BUD-21 · EVP approval over an existing opening head** `P2 · EDGE` ⚠ Suspect
Pre: Mechanical opening heads. Steps: HOD-ME proposal small_value 15,000 → FIN → EVP approve. Expected (SOP): EVP sees the existing ₹10,000 and the result is explicit. Suspect: allocation silently replaced with 15,000.

### 2.2 Visibility

**BUD-22 · Department users see only their heads** `P2 · SEC`
Pre: FX-BUDGET. Steps: FAC-CSE opens Budget heads. Expected: only CSE heads; FIN sees all.

**BUD-23 · Another department's ledger is hidden** `P2 · SEC`
Steps: FAC-ME requests a CSE head ledger (API getHeadLedger). Expected: "Budget head not found."

### 2.3 PR budget check and automatic head

**BUD-24 · New head shows full balance** `P1 · POS`
Pre: FX-BUDGET. Expected: CSE equipment head allocated 60,000, committed 0, spent 0, balance 60,000.

**BUD-25 · PR form shows the head chosen from the category** `P1 · POS`
Steps: FAC-CSE → Raise PR, category Equipment. Expected: no head picker; "CSE-EQUIPMENTASSET-202627 · chosen from the category" (code as created).

**BUD-26 · Switching category switches the head** `P1 · POS`
Steps: change category Equipment → Routine Consumables. Expected: head line changes to the routine head; balance panel updates.

**BUD-27 · Category with no head blocks the PR** `P1 · NEG`
Steps: FAC-CSE, category Software. Expected: red note "Your department has no budget for this category this financial year. Ask your HOD to add it in Annual Budgets."; Submit disabled; API → code budget_head_required.

**BUD-28 · Switching away from a head doesn't keep the old head** `P1 · EDGE`
Steps: Equipment (head shown) → Software. Expected: no head shown, block message appears (regression for the old picker bug).

**BUD-29 · Department with no budget skips the check** `P2 · POS`
Steps: raise a PR for Civil Engineering (no heads). Expected: "No budget has been set for this department this year, so no budget check applies."; PR budget_status none.

**BUD-30 · Server picks the head, not the browser** `P2 · SEC`
Steps: API createPr with an extra `budget_head_id` of a Mechanical head on a CSE PR. Expected: PR saved with the CSE head for its category (field ignored).

**BUD-31 · PR within balance** `P1 · POS`
Steps: CSE Equipment PR 9,500. Expected: panel "Is budget available? Yes"; PR budget_status within.

**BUD-32 · Nothing is reserved at PR approval** `P1 · POS`
Pre: BUD-31 approved. Expected: no budget_ledger row; head balance still 60,000.

**BUD-33 · Over-budget PR needs a reason** `P1 · NEG`
Steps: CSE Equipment PR 70,000, no justification, no re-appropriation ref. Expected: "This is more than the budget balance (Rs. 60,000). Give a justification or a re-appropriation reference; the EVP will then decide."

**BUD-34 · Over-budget PR with justification is accepted** `P1 · POS`
Steps: as BUD-33 with justification. Expected: PR submitted, budget_status over, routed per matrix (70,000 equipment → EVP).

**BUD-35 · Re-appropriation reference alone is enough** `P2 · POS`
Steps: as BUD-33 with only re-appropriation ref. Expected: PR submitted.

**BUD-36 · Over-budget PR approved below EVP is sent to the EVP** `P1 · POS`
Pre: CSE Small Value head 20,000 with 19,000 committed (issue POs first), PR 1,500 with justification (HOD band). Steps: HOD-CSE approves. Expected: toast "Sent to the EVP"; status escalated_to_evp; reason "Over the budget head balance (Rs. 1,500 against Rs. 1,000 available) — needs EVP approval."

**BUD-37 · EVP approves an over-budget PR** `P1 · POS`
Pre: BUD-36. Steps: EVP approves. Expected: approved; budget_status evp_approved.

**BUD-38 · ₹1 tolerance on budget** `P2 · EDGE`
Pre: head balance exactly 2,000. Steps: PR 2,001 → within; PR 2,001.01 → over.

**BUD-39 · Several within-budget PRs can together exceed a head** `P2 · EDGE`
Steps: two CSE Equipment PRs of 40,000 each, both approved. Expected: both within at PR stage (Q12); the second PO to be issued goes to the EVP (BUD-41).

### 2.4 Commit, amendments, spend and release

**BUD-40 · Issuing a PO commits its total** `P1 · POS`
Pre: FX-PO-EQ approved (8,500). Steps: issue. Expected: ledger commit 8,500 note "<PO> issued"; balance 51,500.

**BUD-41 · PO over the balance at issue goes to the EVP** `P1 · NEG`
Pre: BUD-39 second PO approved, balance < PO. Steps: issue. Expected: "<PO> is over the budget head's balance, so it was sent to the EVP. Issue it once the EVP approves." (budget_needs_evp); PO pending_approval, role evp, budget_status over_pending_evp; no commit.

**BUD-42 · EVP-approved over-budget PO commits on re-issue** `P1 · POS`
Pre: BUD-41. Steps: EVP approves, PO-OFF issues. Expected: issued; commit booked; balance may go negative; budget_status evp_approved.

**BUD-43 · PO from an EVP-approved PR skips the EVP loop** `P2 · POS`
Pre: BUD-37 PR → PO approved. Steps: issue over balance. Expected: issued directly.

**BUD-44 · Amendment decrease releases budget** `P1 · POS`
Pre: FX-PO-EQ issued 8,500. Steps: amend price to 8,000. Expected: release 500 "<PO> value reduced"; balance +500.

**BUD-45 · Small amendment increase commits the difference** `P2 · POS`
Pre: FX-PO-EQ issued 8,500 (PR 9,500). Steps: amend to 9,000 (+5.9%). Expected: no re-approval; commit 500 "<PO> value increased".

**BUD-46 · Amendment over the head balance needs the EVP** `P1 · NEG`
Pre: issued PO whose head balance < increase. Steps: amend up. Expected: re-approval role EVP; budget_status over_pending_evp.

**BUD-47 · Payment turns commit into spend** `P1 · POS`
Pre: approved invoice 8,500 on FX-PO-EQ. Steps: FIN records payment. Expected: ledger spend 8,500 "Invoice <no> paid"; head spent 8,500, committed 0, balance unchanged.

**BUD-48 · Full settlement releases any remainder** `P1 · POS`
Pre: PO 8,500 committed, invoices total 8,500 paid. Expected: PO closed; no leftover commitment.

**BUD-49 · Manual close releases the unspent commitment** `P1 · POS`
Pre: PO 8,500 issued, 5,100 invoiced and paid. Steps: PO-OFF → Close PO. Expected: closed; release 3,400.

**BUD-50 · Deductions leave the PO open** `P2 · EDGE` ⚠ Suspect
Pre: invoice approved with deductions and paid. Expected (SOP): PO settles. Suspect: PO stays partially_closed and the remainder stays committed until manually closed.

**BUD-51 · Rejected new PO never touches the budget** `P2 · POS`
Steps: approver rejects a new PO. Expected: status cancelled; no ledger rows.

**BUD-52 · Rejected re-approval after amendment releases the commit** `P2 · EDGE` ⚠ Suspect
Steps: issued PO → amendment → approved → re-issue over budget → EVP rejects. Expected (SOP): original commitment released or kept consistently. Suspect: PO cancelled with its commitment held forever.

**BUD-53 · First issue adds to monthly spend** `P1 · POS`
Pre: department_monthly_spend empty. Steps: issue a 1,500 Small Value PO. Expected: CSE / small_value / current month total_spent 1,500.

**BUD-54 · Amendment increases reach monthly spend** `P2 · EDGE` ⚠ Suspect
Steps: amend an issued PO up and re-issue. Expected (SOP): monthly spend includes the increase. Suspect: monthly spend unchanged.

**BUD-55 · Overspend within match tolerance shows on the head** `P3 · EDGE` ⚠ Suspect
Steps: pay an invoice ₹400 above its PO via EVP deviation (FB-15). Expected: head shows spent > committed sensibly. Suspect: committed goes negative.

**BUD-56 · Quarterly review figures** `P3 · POS`
Pre: FX-BUDGET + BUD-40. Expected: planned per quarter = allocated/4; Q3 committed 8,500.

**BUD-57 · PR raised in March, approved in April** `P3 · EDGE · ⏱` ⚠ Suspect
Expected (SOP): budget re-checked against the new year. Suspect: wrong-year result ignored and approval passes without a budget check.

---

## 3. TC-PR — Requisitions, authority matrix, separation of duties (shared by every flow)

**PR-01 · Faculty raises a Small Value PR within the HOD band** `P1 · POS`
Pre: FX-BUDGET. Steps: FAC-CSE → Raise PR, Small Value, 1 line "A4 paper", group Stationery, qty 5 × 300. Expected: PR submitted, routed HOD, reason "₹1,500 is within the HOD limit of ₹2,000 per transaction and ₹5,000 per month (month-to-date ₹0)."

**PR-02 · ₹2,000 is still HOD** `P1 · EDGE`
Expected: routed HOD.

**PR-03 · ₹2,000.01 goes to the next band** `P1 · EDGE` ⚠ Suspect
Expected (DECISIONS Q2): Principal **and** Procurement Officer may approve. Suspect: only one of them (by DB row order) can; the other gets "This requisition is waiting for the …".

**PR-04 · ₹5,000 Small Value is still direct purchase** `P1 · EDGE`
Expected: routed Principal/Procurement Officer.

**PR-05 · ₹5,000.01 Small Value goes to the EVP** `P1 · EDGE`
Expected: routed EVP, reason "₹5,000.01 exceeds the highest per-transaction limit for "small_value" (₹5,000, …). Escalated to Executive Vice President (EVP)."

**PR-06 · HOD monthly cap moves a small PR up** `P2 · EDGE`
Pre: CSE small_value month-to-date 4,000 (issued POs). Steps: PR 1,500. Expected: routed Principal/Procurement Officer (HOD cap 5,000 exceeded).

**PR-07 · Small Value monthly cap goes to the EVP** `P2 · EDGE`
Pre: month-to-date 29,000. Steps: PR 1,500. Expected: EVP with the monthly-cap message.

**PR-08 · Equipment ₹10,000 vs ₹10,000.01** `P1 · EDGE`
Expected: 10,000 → Purchase Committee; 10,000.01 → EVP.

**PR-09 · Equipment monthly cap** `P2 · EDGE`
Pre: equipment month-to-date 45,000. Steps: PR 6,000. Expected: EVP.

**PR-10 · Routine Consumable routes to the Procurement Officer** `P1 · POS`
Steps: PR 99,000 routine, month-to-date 0. Expected: Procurement Officer, reason mentions "As per approved rate contract, up to ₹1,00,000 per month".

**PR-11 · Routine Consumable over the monthly cap** `P2 · EDGE`
Pre: routine month-to-date 2,000. Steps: PR 99,000. Expected: EVP.

**PR-12 · Category aliases** `P3 · EDGE`
Steps: API createPr category "Repair Services" and "Maintenance consumable". Expected: stored services_amc and routine_consumable.

**PR-13 · Department and justification required** `P2 · NEG`
Expected: "Please select a department" / "Please provide a justification".

**PR-14 · Every line needs an item group** `P1 · NEG`
Expected: "Choose an item group" / Select the item group for "<item>"; API item_group_required.

**PR-15 · Recurring PR needs a frequency** `P2 · NEG`
Expected: "Recurring Frequency Required"; API "Choose how often this requirement recurs, or turn off Recurring Requirement."

**PR-16 · Custom recurring frequency** `P3 · POS`
Expected: custom text saved.

**PR-17 · Net quantity subtracts stock** `P1 · POS`
Steps: qty 10, in stock 4, unit 100. Expected: net 6, line total 600, PR value 600.

**PR-18 · Line fully in stock** `P3 · EDGE`
Steps: qty 5, in stock 5. Expected: net 0, total 0.

**PR-19 · Last line can't be removed** `P3 · NEG`
Expected: "At least one item required".

**PR-20 · HOD approves a PR of their department** `P1 · POS`
Pre: PR-01. Steps: HOD-CSE → My Approvals → Approve. Expected: approved; approval recorded.

**PR-21 · HOD of another department can't act** `P1 · SEC`
Steps: HOD-ME looks for the CSE PR; API approve. Expected: not listed; "You are not the designated Head of Department (HOD) for this requisition's department."

**PR-22 · Requester can't decide their own PR** `P1 · SEC`
Steps: HOD-CSE raises a 1,500 CSE PR. Expected: routed past HOD to Principal/Procurement Officer, reason "… because the requester holds the HOD role."; HOD-CSE's API approve → "You raised this requisition, so another approver must decide it."

**PR-23 · Reject needs a reason** `P1 · NEG`
Expected: "Rejection Reason Required"; API rejection_remarks_required.

**PR-24 · Rejected PR is final** `P1 · POS`
Pre: rejected PR. Steps: approve it (API). Expected: '<PR> is already "rejected" and can't be changed.'

**PR-25 · Approver escalates to the EVP** `P2 · POS`
Steps: HOD-CSE → Escalate. Expected: escalated_to_evp; only EVP can now decide; escalating again → "<PR> is already with the EVP."

**PR-26 · Wrong role can't approve** `P1 · SEC`
Steps: PC approves a HOD-routed PR (API). Expected: "This requisition is waiting for the HOD. You don't hold that role."

**PR-27 · Rejected PR can't go to purchase** `P1 · NEG`
Expected: RFQ/PO attempts → pr_not_approved.

**PR-28 · Roles outside the nav can still raise a PR** `P3 · SEC` ⚠ Suspect
Steps: FIN opens /procurement/raise-pr and submits. Expected (SOP): blocked. Suspect: PR created.

**PR-29 · PR value is recomputed on the server** `P2 · SEC` ⚠ Suspect
Steps: API createPr with lines totalling 9,000 and estimated_value 1,000. Expected: server uses 9,000 (PC band). Suspect: stored 1,000, routed HOD.

**PR-30 · PR can't be inserted directly as approved** `P1 · SEC` ⚠ Suspect
Steps: REST insert into purchase_requisitions with status approved using a faculty token. Expected: denied by RLS. Suspect: allowed.

**PR-31 · EVP's own PR that routes to the EVP** `P3 · EDGE` ⚠ Suspect
Expected: someone can decide it. Suspect: only ADM.

**PR-32 · PR re-routed after month-to-date changes** `P3 · EDGE` ⚠ Suspect
Steps: PR listed for HOD; issue other POs so HOD cap is exceeded; HOD approves. Expected: consistent routing. Suspect: listed to HOD but blocked; new approver never sees it.

---

## 4. TC-DP — Direct purchase, normal (your item 1)

**DP-01 · Direct purchase PO is approved on the PR's authority** `P1 · POS`
Pre: FX-PR-SV(1500) approved by HOD-CSE. Steps: PO-OFF → Create PO → Direct Purchase → Buy from one vendor → V-PRIME, price 1,500, tick "not available in Central Stores" → create.
Expected: status approved; toast "PO <no> is approved on the requisition's authority and ready to issue."; reason "Direct purchase — authorised by the HOD's approval of <PR>."

**DP-02 · Approval fields come from the PR approval** `P2 · POS`
Pre: DP-01. Expected: approved_by = HOD-CSE, original_approver_role hod.

**DP-03 · Stores check is recorded on the PO** `P2 · POS`
Expected: scope contains "Checked: not available in Central Stores."

**DP-04 · Optional quotes note** `P3 · POS`
Steps: as DP-01 with quotes note "2 phone quotes". Expected: scope contains "Quotes: 2 phone quotes".

**DP-05 · Issue a direct purchase PO** `P1 · POS`
Pre: DP-01. Steps: Issue to Vendor. Expected: issued; budget commit 1,500; monthly spend +1,500.

**DP-06 · PO email goes to vendor with internal copies** `P1 · POS`
Pre: DP-05. Expected: V-PRIME gets `[Purchase Order] <PO> — AMC Engineering College` with `<PO>.pdf`; CC HOD-CSE, all stores and finance users; toast "Order … issued. PDF emailed to … Copies sent to internal stakeholders (n)."

**DP-07 · Principal-band direct purchase** `P1 · POS`
Pre: FX-PR-SV(4000) approved by Principal/Procurement Officer. Steps: create direct PO 4,000. Expected: approved; original_approver_role = that approver.

**DP-08 · Ask several vendors for quotes** `P2 · POS`
Pre: FX-PR-SV(4000). Steps: Direct Purchase → Compare quotes → V-PRIME, V-ARW, deadline today+3 → send. Expected: RFQ sent; PR shows "· quotes requested on <RFQ>" and is disabled in the PO dropdown.

**DP-09 · Award the lowest quote** `P1 · POS`
Pre: DP-08, quotes 3,900 / 4,000. Steps: RFQ page → Award → V-PRIME (lowest), stores ticked. Expected: PO approved, price 3,900, delivery = slowest line days, payment terms from the quote; RFQ closed.

**DP-10 · Award a non-lowest quote with a reason** `P2 · POS`
Steps: award V-ARW with justification. Expected: PO created; scope "Not the lowest quote — reason: …".

**DP-11 · Full direct purchase cycle to payment** `P1 · POS`
Pre: DP-05. Steps: STO records DC → GRN (inspection off) → FIN invoice 1,500 → approve → STO≠… FIN pays. Expected: GRN accepted; invoice matched → approved → paid; PO closed; ledger commit→spend.

**DP-12 · Price plus taxes within the PR value** `P2 · POS`
Pre: FX-PR-SV(1500). Steps: price 1,271, taxes 229. Expected: PO total 1,500 approved.

---

## 5. TC-DPN — Direct purchase, negative (your item 2)

**DPN-01 · Unapproved PR can't be bought** `P1 · NEG`
Steps: API createPo direct for a submitted PR. Expected: 'Purchase requisition <PR> is "submitted". No procurement step may proceed until it is approved.' (pr_not_approved); not in dropdown.

**DPN-02 · Routine Consumable PR isn't a direct purchase** `P1 · NEG`
Pre: FX-PR-RTN(3000). Expected: "<PR> is not a small-value direct purchase. Use a Comparative Statement or rate contract." (not_direct_purchase)

**DPN-03 · Equipment PR isn't a direct purchase** `P1 · NEG`
Pre: FX-PR-EQ(4000). Expected: not_direct_purchase.

**DPN-04 · Small Value PR above ₹5,000 isn't a direct purchase** `P1 · NEG`
Pre: Small Value PR 6,000 approved by EVP. Expected: not_direct_purchase.

**DPN-05 · Stores check required** `P1 · NEG` ⚠ Suspect (UI)
Steps: create direct PO without ticking stores. Expected: "Confirm the items are not available in Central Stores before buying." (stores_check_required). Suspect: button not disabled in single-vendor mode.

**DPN-06 · One PO per requisition** `P1 · NEG`
Pre: DP-01. Steps: second direct PO on same PR. Expected: "<PR> already has purchase order <PO>." (pr_already_ordered)

**DPN-07 · Zero amount** `P2 · NEG`
Expected: "Enter the order amount." (invalid_amount)

**DPN-08 · Amount above the PR value** `P1 · NEG`
Pre: FX-PR-SV(1500). Steps: price 1,600. Expected: "The order (Rs. 1,600) is more than the approved requisition value (Rs. 1,500)." (exceeds_pr_value)

**DPN-09 · ₹0.50 above PR value** `P3 · EDGE` ⚠ Suspect
Steps: price 1,500.50. Expected: one consistent rule. Suspect: passes exceeds_pr_value (+1 tolerance) then fails as po_splitting (0 tolerance).

**DPN-10 · Month-to-date pushes the order over the direct limit** `P2 · EDGE`
Pre: FX-PR-SV(4000) approved; then issue other CSE small value POs to 27,000 this month. Steps: create direct PO 4,000. Expected: "This amount is above the direct-purchase limit for this month. Use a Comparative Statement instead." (exceeds_direct_limit)

**DPN-11 · Debarred vendor can't be chosen** `P1 · NEG`
Steps: UI list; API with V-DEB. Expected: V-DEB not listed; 'Vendor "LUMINEX" is "debarred". Only empanelled vendors may be awarded work.'

**DPN-12 · Expired empanelment** `P2 · NEG · ⏱`
Pre: set an empanelled vendor's expiry to yesterday. Expected: not listed; API "… empanelment expired on <date>. Renew before awarding work."

**DPN-13 · Rejected vendor isn't offered** `P3 · NEG`
Expected: V-REJ not in vendor list.

**DPN-14 · Rate contract covers the items** `P1 · NEG`
Pre: FX-PR-SV(1500) stationery approved, then FX-RC active. Expected: "Items on <PR> are covered by rate contract <RC>; order them under that contract." (rate_contract_applies)

**DPN-15 · Quotes already requested** `P2 · NEG`
Pre: DP-08. Steps: API single-vendor direct PO on that PR. Expected: "Quotes for <PR> were requested on <RFQ>. Award the order from the RFQ page." (quotes_pending)

**DPN-16 · Compare-quotes needs two vendors** `P3 · NEG` ⚠ Suspect
Steps: pick 1 vendor. Expected: "Choose the requisition and at least 2 vendors to compare quotes." Suspect: server accepts 1 (min quotes 1).

**DPN-17 · Only the Procurement Officer awards** `P2 · SEC`
Steps: PEX awards via API. Expected: "Only the procurement officer can award a purchase order."

**DPN-18 · Award on a closed RFQ** `P2 · NEG`
Pre: DP-09 done. Steps: award again. Expected: '<RFQ> is "closed"; only open RFQs can be awarded.'

**DPN-19 · Award a vendor who didn't quote** `P2 · NEG`
Expected: "That vendor has not submitted a quotation on this RFQ." (no_quotation)

**DPN-20 · Non-lowest award needs a reason** `P2 · NEG`
Expected: "Explain why you are choosing a vendor other than the lowest quote." (justification_required)

**DPN-21 · Splitting: same vendor, same department and category within 30 days** `P1 · EDGE`
Pre: issued direct PO 3,000 to V-PRIME (CSE small_value) today; new FX-PR-SV(3000). Steps: direct PO 3,000 to V-PRIME. Expected: PO pending_approval to EVP; reason "Orders to this vendor in the last 30 days total ₹6,000 (earlier: ₹3,000, this order: ₹3,000), so this order needs EVP approval."; toast "routed to EVP".

**DPN-22 · Splitting check ignores a different vendor** `P2 · EDGE`
Pre: as DPN-21, new PO to V-ARW. Expected: approved directly.

**DPN-23 · Splitting check ignores a different category** `P3 · EDGE`
Expected: no escalation when earlier PO is another category.

**DPN-24 · Splitting check ignores cancelled orders** `P3 · EDGE`
Expected: earlier cancelled PO not counted.

**DPN-25 · Splitting window is 30 days** `P3 · EDGE · ⏱`
Pre: earlier PO created 31 days ago. Expected: no escalation.

**DPN-26 · Escalated direct PO notifies the approver** `P2 · POS` ⚠ Suspect
Pre: DPN-21. Expected: EVP gets an approval email. Suspect: none sent.

**DPN-27 · Procurement Executive sees Create PO but can't use it** `P3 · SEC` ⚠ Suspect
Expected: button hidden for PEX. Suspect: shown; server says "Only Procurement Officers can create Purchase Orders."

**DPN-28 · PR approver can't also create the PO** `P2 · SEC` ⚠ Suspect
Pre: Small Value 3,000 PR approved by PO-OFF. Steps: PO-OFF creates the direct PO. Expected (SoD): blocked or re-routed. Suspect: PO approved_by = created_by = PO-OFF.

**DPN-29 · PO email can't be triggered by anyone for any PO** `P3 · SEC` ⚠ Suspect
Steps: FAC-CSE calls dispatchPoEmail for a pending PO. Expected: rejected. Suspect: email sent.

---

## 6. TC-DPA — Direct purchase PO amendments (your item 3)

**DPA-01 · Decrease needs no re-approval** `P1 · POS`
Pre: FX-PO-DP issued 1,500. Steps: Amend → price 1,200, reason. Expected: "PO Amended"; status issued; amendment approved; release 300.

**DPA-02 · Increase within 10% and the PR value** `P1 · POS`
Pre: FX-PR-SV(1500) → issued PO 1,400. Steps: amend to 1,500 (+7.1%). Expected: no re-approval; commit 100.

**DPA-03 · Increase above the PR value is blocked** `P1 · NEG`
Pre: FX-PO-DP 1,500. Steps: amend to 1,600. Expected: toast "Amendment Blocked", po_splitting "…would total ₹1,600, more than its approved value of ₹1,500…".

**DPA-04 · Increase over 10% needs re-approval** `P1 · POS`
Pre: FX-PR-SV(1500) → issued PO 1,000. Steps: amend to 1,200. Expected: "Sent to the HOD for approval…"; PO pending_approval; price already 1,200.

**DPA-05 · HOD approves the amendment; PO must be re-issued** `P1 · POS`
Pre: DPA-04. Steps: HOD-CSE approves in Amendments tab; PO-OFF issues. Expected: approved → issued; commit 200.

**DPA-06 · HOD rejects the amendment** `P1 · POS`
Pre: DPA-04. Steps: reject with remarks. Expected: "The order is back to its previous value."; price 1,000; status issued; reason "Amendment rejected: …".

**DPA-07 · Amendment rejection needs a reason** `P2 · NEG`
Expected: "Enter a reason for rejecting this purchase order."

**DPA-08 · Can't amend below what was received or billed** `P1 · NEG`
Pre: FX-PO-DP with GRN accepted 1,500. Steps: amend to 1,000. Expected: "The new total (Rs. 1,000) is below what has already been received or billed (Rs. 1,500)."

**DPA-09 · Pending or held invoices don't set the floor** `P2 · EDGE`
Pre: invoice on hold 1,500, no GRN. Steps: amend to 1,200. Expected: allowed.

**DPA-10 · No second amendment while one is pending** `P2 · NEG`
Pre: DPA-04. Expected: '<PO> is "pending_approval" and can't be amended.'

**DPA-11 · Amendment needs a reason** `P2 · NEG`
Expected: "Please provide valid amended values and reason."; API "Enter the reason for this amendment."

**DPA-12 · Executive can't amend** `P3 · SEC` ⚠ Suspect
Expected: button hidden for PEX. Suspect: shown; "Only the procurement officer can amend purchase orders."

**DPA-13 · Approved-but-not-issued PO amendment** `P3 · EDGE`
Steps: API amend an approved direct PO. Expected: allowed (UI hides the button until issued).

**DPA-14 · Direct PO whose PR approver role is unknown** `P3 · EDGE` ⚠ Suspect
Pre: direct PO with original_approver_role "approver"/"admin". Steps: decrease. Expected: no re-approval. Suspect: every amendment requires re-approval.

**DPA-15 · Who may approve an amendment** `P2 · SEC` ⚠ Suspect
Expected: the person who amended can't approve it. Suspect: check uses the PO creator, so ADM can approve an amendment ADM made if someone else created the PO.

---

## 7. TC-3W — Regular purchase with three-way match, normal (your item 4)

**3W-01 · Equipment PR approved by the Purchase Committee** `P1 · POS`
Steps: FAC-CSE PR equipment 9,500 → PC approves. Expected: approved.

**3W-02 · RFQ needs three quotations** `P1 · POS`
Pre: 3W-01. Steps: PO-OFF → Create RFQ, deadline today+5. Expected: draft, "Min 3 Quotes Required".

**3W-03 · Send RFQ to three vendors** `P1 · POS`
Steps: invite V-DELL, V-LEN, V-APXT. Expected: sent; 3 emails with private links.

**3W-04 · Vendor opens the quotation page** `P1 · POS`
Steps: open V-DELL's link. Expected: RFQ number, items, quantities, deadline; form enabled.

**3W-05 · Vendor submits a valid quotation** `P1 · POS`
Steps: total 8,500, delivery 10, validity deadline+31, contact, phone, payment terms, T&C. Expected: submitted; RFQ card "submitted" badge for V-DELL.

**3W-06 · Re-email only vendors who haven't quoted** `P2 · POS`
Pre: 1 of 3 quoted. Steps: Email vendors again. Expected: "2 of 2 vendor(s) emailed".

**3W-07 · Prepare CS with the lowest vendor** `P1 · POS`
Pre: FX-RFQ-EQ. Steps: CS page → prepare, recommend V-DELL. Expected: submitted, "Routed to PURCHASE COMMITTEE for authority review."

**3W-08 · Purchase Committee approves the CS** `P1 · POS`
Steps: PC approves. Expected: approved; PO-OFF emailed.

**3W-09 · PO created from the approved CS** `P1 · POS`
Steps: PO-OFF → Regular Order → CS. Expected: vendor V-DELL, price 8,500; status pending_approval routed PC.

**3W-10 · Purchase Committee approves the PO** `P1 · POS`
Expected: approved.

**3W-11 · Issue the PO** `P1 · POS`
Expected: issued; commit 8,500; email + PDF.

**3W-12 · Stores records the delivery challan** `P1 · POS`
Steps: STO → Record Challan for the PO. Expected: DC-…-1001 created.

**3W-13 · GRN at PO rates, awaiting inspection** `P1 · POS`
Steps: STO → Create GRN from DC, inspection ticked, accept all. Expected: GRN pending; unit price read-only "PO Rate (₹)"; accepted value 8,500.

**3W-14 · HOD accepts technically** `P1 · POS`
Steps: HOD-CSE → Technical Accept. Expected: GRN accepted.

**3W-15 · Stores security sign-off** `P3 · POS`
Expected: security verified by/at recorded.

**3W-16 · Invoice equal to PO and GRN matches** `P1 · POS`
Steps: FIN submits invoice 8,500. Expected: "Three-Way Match Passed"; matched.

**3W-17 · Finance approves the invoice they entered** `P1 · POS`
Steps: FIN (same user) approves. Expected: approved (product decision 2026-10-22).

**3W-18 · Finance records full payment; PO closes** `P1 · POS`
Steps: Record Payment 8,500, UTR. Expected: paid; PO closed; spend 8,500.

**3W-19 · Partial delivery, partial invoice** `P1 · POS`
Pre: FX-GRN-PART (5,100). Steps: invoice 5,100 → approve → pay. Expected: matched; paid; PO partially_closed.

**3W-20 · Two partial invoices total the PO** `P2 · POS`
Pre: GRNs accepted 8,500. Steps: invoice 4,000 then 4,500. Expected: both matched; after both paid PO closed.

**3W-21 · Service order with completion certificate** `P2 · POS`
Pre: services_amc PR → PO issued. Steps: invoice, tick service, certificate URL. Expected: matched without GRN.

**3W-22 · GRN without inspection is accepted at once** `P2 · POS`
Expected: status accepted on creation.

**3W-23 · Invoice number is normalised** `P3 · POS`
Steps: number " inv-77" with trailing space. Expected: stored "INV-77".

**3W-24 · Matched invoice appears in My Approvals for Finance** `P2 · POS`
Expected: listed under Invoices for FIN.

**3W-25 · CS recommending non-lowest with rationale** `P2 · POS`
Expected: submitted with rationale shown to approver.

---

## 8. TC-3WN — Three-way purchase, negative (your item 5)

RFQ and vendor portal
- **3WN-01 · RFQ on an unapproved PR** `P1 · NEG` — Expected: pr_not_approved message.
- **3WN-02 · Second RFQ on the same PR** `P1 · NEG` — Expected: "<PR> already has an RFQ (<RFQ>, status: …)." (rfq_exists)
- **3WN-03 · Sending to fewer than three vendors** `P1 · NEG` — Expected: "Insufficient Vendors"; API "Select at least 3 empanelled vendors to send this RFQ (you selected 2)."
- **3WN-04 · Debarred vendor in the invite (API)** `P1 · NEG` — Expected: vendor_not_empanelled.
- **3WN-05 · Quote links not configured (staging only)** `P3 · NEG` — Expected: links_not_configured message.
- **3WN-06 · Tampered quote link** `P1 · SEC` — Steps: change token. Expected: "Invalid or unauthorized quotation access token."
- **3WN-07 · Link for an uninvited vendor** `P1 · SEC` — Expected: "Vendor is not invited to this RFQ."
- **3WN-08 · Quote after the deadline day** `P1 · NEG · ⏱` — Pre: RFQ deadline 2 days ago. Expected: "The submission deadline (…) has passed."
- **3WN-09 · Quote on the deadline day** `P2 · EDGE` ⚠ Suspect — Expected: accepted all day. Suspect: page says "Quotation Expired" from 00:00 UTC.
- **3WN-10 · Delivery days 0, 366, 2.5** `P2 · NEG` — Expected: "Delivery time must be whole days between 1 and 365."
- **3WN-11 · Validity too short** `P2 · NEG` — Expected: "Quotation validity must be on or after <deadline+30d>."
- **3WN-12 · Missing payment terms / contact / phone** `P2 · NEG` — Expected: "Payment terms, contact person and contact phone are required."
- **3WN-13 · Short description, bad phone, T&C unticked** `P3 · NEG` — Expected: form errors (≥10 chars, 10–15 digits, terms required).
- **3WN-14 · Quote after the CS is prepared** `P2 · NEG` — Expected: "Quotation submission is closed. A Comparative Statement has already been prepared for this RFQ."

Comparative statement
- **3WN-15 · CS with fewer than three compliant quotes** `P1 · NEG` — Expected: "A Comparative Statement needs at least 3 technically compliant quotations; 2 received so far."
- **3WN-16 · Non-lowest without rationale** `P1 · NEG` — Expected: "Explain why you are recommending a vendor other than the lowest bidder."
- **3WN-17 · Purchase Committee can't prepare the CS** `P2 · SEC` — Expected: "Only the procurement team can prepare a Comparative Statement…"
- **3WN-18 · Preparer can't approve the CS** `P1 · SEC` — Expected: "You prepared this comparative statement, so another approver must decide it."
- **3WN-19 · Wrong role approves the CS** `P2 · SEC` — Expected: "This comparative statement is waiting for the Purchase Committee."
- **3WN-20 · CS rejection needs remarks** `P2 · NEG` ⚠ Suspect — Expected: required. Suspect: API allows blank.
- **3WN-21 · Another user overwrites a pending CS** `P2 · NEG` — Expected: cs_pending_approval_locked message.
- **3WN-22 · Re-preparing an approved CS** `P2 · NEG` — Expected: cs_already_approved message.
- **3WN-23 · CS page counts vendors, not lines** `P3 · EDGE` ⚠ Suspect — Pre: 2 vendors, 3 lines. Expected: not shown "Ready". Suspect: shown Ready.

Purchase order
- **3WN-24 · Regular PO without CS / with unapproved CS** `P1 · NEG` — Expected: cs_required / cs_not_approved.
- **3WN-25 · PO to a vendor other than the CS winner (API)** `P1 · NEG` — Expected: "The purchase order must go to the vendor awarded in <CS>."
- **3WN-26 · PO total above the CS total** `P1 · NEG` — Steps: price 8,500 + taxes 500. Expected: cs_total_exceeded.
- **3WN-27 · Second PO for one CS** `P2 · NEG` — Expected: cs_already_ordered.
- **3WN-28 · PO creator can't approve** `P1 · SEC` — Expected: "You created this purchase order, so another approver must decide it."
- **3WN-29 · Issuing an unapproved PO** `P1 · NEG` — Expected: '… must be approved before it can be issued.'
- **3WN-30 · Finance can't issue** `P2 · SEC` — Expected: "Only the procurement team can issue purchase orders."

Receipt
- **3WN-31 · GRN without a challan** `P1 · NEG` — Expected: "Record the delivery challan at the gate before creating a GRN."
- **3WN-32 · Same challan twice** `P1 · NEG` — Expected: challan_already_processed message.
- **3WN-33 · Challan from another PO (API)** `P2 · NEG` ⚠ Suspect — Expected: rejected. Suspect: accepted.
- **3WN-34 · Over-delivery** `P1 · NEG` — Steps: delivered qty > ordered. Expected: "Over-Delivery Blocked" (over_delivery_not_permitted).
- **3WN-35 · Rejected lot replaced** `P2 · EDGE` ⚠ Suspect — Pre: GRN rejected for full qty. Steps: new DC + GRN full qty. Expected: allowed. Suspect: over_delivery_not_permitted (rejected GRNs counted).
- **3WN-36 · Accepted value above PO** `P2 · NEG` — Expected: grn_value_exceeds_po.
- **3WN-37 · Delivered quantity zero** `P2 · NEG` — Expected: "Delivered quantity must be greater than zero for item …".
- **3WN-38 · Preparer can't inspect** `P1 · SEC` — Expected: "You prepared this goods receipt, so someone else must do the technical inspection."
- **3WN-39 · Faculty inspect button** `P3 · SEC` ⚠ Suspect — Expected: no button for faculty. Suspect: button shown, server rejects.
- **3WN-40 · HOD of another department inspects** `P2 · SEC` ⚠ Suspect — Expected: blocked. Suspect: allowed.
- **3WN-41 · Rejection without reason** `P2 · NEG` ⚠ Suspect — Expected: reason required. Suspect: accepted blank.
- **3WN-42 · Re-inspecting a decided GRN** `P1 · EDGE` ⚠ Suspect — Pre: GRN accepted, invoice matched. Steps: technical reject. Expected: blocked. Suspect: flips to rejected.
- **3WN-43 · Second partial delivery after first GRN accepted** `P1 · EDGE` ⚠ Suspect — Expected: second challan can be recorded. Suspect: PO hidden from Record Challan.
- **3WN-44 · Remaining delivery after a partial payment** `P1 · EDGE` ⚠ Suspect — Pre: 3W-19 (PO partially_closed). Expected: rest can be received. Suspect: PO not listed on GRN page.
- **3WN-45 · Challan on an unissued PO (API)** `P2 · NEG` ⚠ Suspect — Expected: rejected. Suspect: accepted.
- **3WN-46 · Accepting a GRN on an unapproved PO** `P1 · SEC` ⚠ Suspect — Expected: PO stays pending. Suspect: PO jumps to issued.

Invoice and payment
- **3WN-47 · Invoice without accepted GRN** `P1 · NEG` — Expected: on_hold, "No accepted goods receipt (GRN) for this purchase order yet." (no_grn)
- **3WN-48 · Invoice above accepted GRN** `P1 · NEG` — Pre: FX-GRN-PART 5,100. Steps: invoice 8,500. Expected: on_hold exceeds_grn.
- **3WN-49 · Invoice above PO** `P1 · NEG` — Steps: invoice 8,600 on 8,500 PO. Expected: on_hold exceeds_po.
- **3WN-50 · ₹1 rounding still matches** `P2 · EDGE` — Steps: invoice 8,501. Expected: matched.
- **3WN-51 · Zero invoice (API)** `P3 · NEG` ⚠ Suspect — Expected: rejected. Suspect: saved on_hold zero_amount.
- **3WN-52 · Duplicate invoice number** `P1 · NEG` — Steps: same number in different case/with spaces, same vendor. Expected: "Invoice "<NO>" has already been submitted for this vendor."
- **3WN-53 · Same number, different vendor** `P3 · POS` — Expected: accepted.
- **3WN-54 · Approving a held invoice** `P1 · NEG` — Expected: three_way_match_not_passed.
- **3WN-55 · GRN preparer can't approve the invoice** `P1 · SEC` — Pre: ADM prepared GRN. Expected: "You received these goods, so someone else must approve the invoice."
- **3WN-56 · PO creator approves invoice** `P2 · SEC` ⚠ Suspect — Expected: blocked (SoD). Suspect: allowed for PO-OFF.
- **3WN-57 · Approval re-checks the match** `P1 · EDGE` — Pre: matched invoice 8,500; PO amended down to 8,000. Steps: approve. Expected: "… no longer matches and was put on hold: …".
- **3WN-58 · Stores can't submit invoices** `P2 · SEC` — Expected: "Only Finance or the procurement team can submit invoices."
- **3WN-59 · Service flag on a goods PO** `P2 · NEG` — Expected: "<PO> is not a services order, so a completion certificate can't replace the goods receipt."
- **3WN-60 · Invoice on a closed PO (API)** `P2 · NEG` ⚠ Suspect — Expected: rejected. Suspect: accepted.
- **3WN-61 · PO creator can't pay** `P1 · SEC` — Pre: ADM created the PO. Steps: ADM pays. Expected: "You created this purchase order, so someone else must record its payment."
- **3WN-62 · Paying a matched-but-unapproved invoice** `P1 · NEG` — Expected: invoice_not_approved.
- **3WN-63 · Payment amount mismatch** `P1 · NEG` — Steps: pay 8,000 on 8,500. Expected: "Payment must equal the approved amount of Rs. 8,500 (entered Rs. 8,000)."
- **3WN-64 · Procurement Officer can't pay** `P1 · SEC` — Expected: error "Recording payment requires Finance role authorization…"
- **3WN-65 · Double payment by double-click** `P2 · EDGE` ⚠ Suspect — Expected: one payment. Suspect: two payment rows possible.

---

## 9. TC-RC — Routine consumables and rate contracts (your item 6)

Creating the contract
- **RC-01 · Create a rate contract RFQ** `P1 · POS` — Steps: PO-OFF → RFQs → Rate contract RFQ: title "Stationery H2", Routine Consumables, items A4 paper (Stationery, ream), Toner 88A (Printing, nos). Expected: draft; badge "Rate contract · no CS"; "Min 3 Quotes Required".
- **RC-02 · Title required** `P2 · NEG` — Expected: "Give the RFQ a title."
- **RC-03 · Item needed** `P2 · NEG` — Expected: "Add at least one item to price."
- **RC-04 · Item group must be a routine consumable** `P2 · NEG` — Steps: API group not_consumable. Expected: 'Choose a routine-consumable item group for "…".'
- **RC-05 · Only the Procurement Officer creates rate RFQs** `P3 · SEC` — Expected: PEX has no button; API "Only Procurement Officers can create RFQs."
- **RC-06 · Send to three vendors** `P1 · POS` — Steps: invite V-PRIME, V-ARW, V-APXS. Expected: sent; email category "Rate contract (Routine Consumables)".
- **RC-07 · Vendor quotes a rate per item** `P1 · POS` — Steps: V-PRIME enters 230 and 1,750. Expected: total field read-only = 1,980; submitted.
- **RC-08 · Every item must be priced** `P1 · NEG` — Steps: leave toner blank. Expected: "Unit rates required" / "Enter a unit rate greater than 0 for every item."
- **RC-09 · Comparison table** `P2 · POS` — Pre: 3 complete quotes (1,980 / 2,050 / 2,100). Expected: per-item table, lowest per item in green, V-PRIME "Lowest".
- **RC-10 · Incomplete quote not counted** `P2 · EDGE` — Pre: a 4th vendor priced one item (API). Expected: "Not counted (didn't price every item): …".
- **RC-11 · Fewer than three complete quotes** `P1 · NEG` — Pre: 2 complete. Expected: "Waiting for quotations: 2 of 3 complete so far."; API "Rates need at least 3 complete quotations (every item priced); 2 received."
- **RC-12 · Create the contract from the lowest quote** `P1 · POS` — Steps: Send to EVP. Expected: pending_approval; number RC-…; RFQ closed; toast "<RC> covers purchases once the EVP approves it."
- **RC-13 · Non-lowest vendor needs a justification** `P1 · NEG` — Expected: button disabled until filled; API justification_required.
- **RC-14 · Non-lowest justification reaches the EVP** `P2 · POS` — Expected: EVP card "Why not the lowest quote: …".
- **RC-15 · Validity over six months** `P1 · NEG` — Expected: "A rate contract is valid for at most six months (SOP Section VI)."
- **RC-16 · Validity end before start** `P2 · NEG` — Expected: "The contract must end after it starts."
- **RC-17 · One contract per RFQ** `P2 · NEG` — Steps: API create again. Expected: "<RFQ> already has rate contract <RC>."
- **RC-18 · Vendor with an incomplete quote can't be chosen (API)** `P3 · NEG` — Expected: "This vendor didn't quote a rate for every item."
- **RC-19 · Vendor debarred after quoting** `P2 · NEG` — Expected: vendor_not_empanelled.
- **RC-20 · Quote after the contract is created** `P2 · NEG` — Expected: "This RFQ is closed and no longer accepts quotations."
- **RC-21 · Rate RFQ never goes to a CS** `P2 · NEG` — Expected: not in CS page list; API "<RFQ> finalises rate-contract rates. Create the rate contract from its quotes instead."

EVP approval
- **RC-22 · EVP sees the contract with its quotes** `P1 · POS` — Expected: My Approvals → Rate contracts: rates, validity, quotes ranked, "From <RFQ>".
- **RC-23 · Creator can't decide** `P1 · SEC` — Pre: ADM created the contract. Expected: "You created this rate contract, so someone else must decide it."
- **RC-24 · Only the EVP decides** `P1 · SEC` — Steps: PC calls decide. Expected: "Only the EVP approves rate contracts."
- **RC-25 · Rejection needs a reason** `P2 · NEG` — Expected: "Give a reason for rejecting this rate contract."
- **RC-26 · EVP approves** `P1 · POS` — Expected: active; toast "<RC> now covers purchases until <date>."
- **RC-27 · EVP rejects** `P1 · POS` — Expected: rejected; not in PO picker; API PO → "Rate contract <RC> was rejected by the EVP."
- **RC-28 · Pending contract can't be used** `P1 · NEG` — Expected: picker "No EVP-approved rate contracts in force" + "1 rate contract is waiting for the EVP's approval…"; API "…is waiting for the EVP's approval." (rc_not_approved)
- **RC-29 · Old manual dialog is gone** `P2 · POS` — Expected: "+ New Rate Contract" opens the RFQ page.

Contract before / after / during the first purchase
- **RC-30 · Contract exists before the PR (Small Value blocked)** `P1 · NEG` — Pre: FX-RC. Steps: FAC-CSE Small Value PR with a Stationery line. Expected: Small Value option disabled, category forced to Routine Consumables, hint "Small Value is unavailable…"; API "Stationery & Office Supplies is covered by rate contract <RC> (valid to …). Raise this as Routine Consumables (Rate Contract)…"
- **RC-31 · Contract approved after the PR (direct PO blocked)** `P1 · NEG` — Same as DPN-14.
- **RC-32 · First purchase with no contract yet** `P1 · POS` — Pre: no active contract. Steps: FX-PR-RTN(3000) → RFQ (min 3) → CS (≥ Purchase Committee) → regular PO. Expected: whole flow allowed.
- **RC-33 · Uncovered group still allows Small Value** `P2 · POS` — Pre: FX-RC (stationery, printing). Steps: Small Value PR with a Housekeeping line. Expected: allowed.
- **RC-34 · Not-a-consumable line never matches** `P3 · EDGE` — Expected: no rate-contract block for group not_consumable.

Using the contract
- **RC-35 · Order under the contract** `P1 · POS` — Pre: FX-RC, FX-PR-RTN(4600) (20 reams). Steps: Create PO → Rate Contract Order → pick RC → price 4,600. Expected: vendor auto V-PRIME; pending_approval to Purchase Committee (creator holds Procurement Officer); approve → issue → DC/GRN/invoice/payment as 3W.
- **RC-36 · Price above contract rates** `P1 · NEG` ⚠ Suspect — Steps: price 6,000 for 20 reams (contract 230). Expected: blocked. Suspect: accepted.
- **RC-37 · Vendor other than the contract vendor (API)** `P2 · SEC` ⚠ Suspect — Expected: blocked. Suspect: accepted.
- **RC-38 · PR items not in the contract** `P2 · NEG` ⚠ Suspect — Steps: PR with Housekeeping items ordered under FX-RC. Expected: blocked. Suspect: accepted.
- **RC-39 · Expired contract** `P1 · NEG · ⏱` — Pre: create a contract valid from 200 days ago to 10 days ago; EVP approves. Expected: not in picker; API "Rate contract is not active (valid: … to …)."
- **RC-40 · Future-dated contract** `P2 · EDGE · ⏱` — Pre: valid from tomorrow. Expected: not usable today; doesn't block Small Value.
- **RC-41 · Monthly ₹1,00,000 routes to the EVP** `P2 · EDGE` — Pre: routine month-to-date 98,000. Steps: RC PO 4,600. Expected: routed EVP (not blocked).
- **RC-42 · Browser can't write rate contracts** `P1 · SEC` — Steps: REST insert into rate_contracts with a PO-OFF token. Expected: denied (no write policy).

---

## 10. TC-AMD and TC-FB — PO amendments and three-way fallback edge cases (your item 7)

Regular PO amendments
- **AMD-01 · Decrease, same tier** `P1 · POS` — Pre: FX-PO-EQ issued 8,500. Steps: amend 8,000. Expected: no re-approval; release 500.
- **AMD-02 · Increase ≤ 10% within the PR value** `P1 · POS` — Pre: PR 9,500, PO 8,500. Steps: amend 9,300. Expected: no re-approval.
- **AMD-03 · Increase > 10%** `P1 · POS` — Pre: PR 9,500, PO 8,000. Steps: amend 9,000. Expected: re-approval Purchase Committee.
- **AMD-04 · Increase into the EVP band** `P1 · POS` — Pre: equipment PR 14,000 (EVP-approved), CS/PO 9,500 approved by PC, issued. Steps: amend 12,000. Expected: re-approval EVP.
- **AMD-05 · CS above the PR value** `P2 · EDGE` ⚠ Suspect — Pre: CS total 9,800 > PR 9,500. Steps: amend up by 100. Expected: allowed up to CS. Suspect: po_splitting (cap is PR value).
- **AMD-06 · Approve amendment, re-issue** `P1 · POS` — Expected: approved → issued; commit delta.
- **AMD-07 · Reject amendment** `P1 · POS` — Expected: value restored; previous status.
- **AMD-08 · Floor from accepted GRN** `P1 · NEG` — Pre: GRN accepted 6,000. Steps: amend 5,000. Expected: below-received message.
- **AMD-09 · Floor uses approved amount after deductions** `P2 · EDGE` — Pre: invoice 8,500 approved with payable 7,000. Steps: amend 7,500. Expected: allowed (floor 7,000 or GRN value, whichever higher).
- **AMD-10 · Over-budget amendment → EVP** `P1 · NEG` — Same as BUD-46.
- **AMD-11 · EVP rejects over-budget amendment** `P2 · EDGE` ⚠ Suspect — Expected: budget_status back to normal. Suspect: stays over_pending_evp.
- **AMD-12 · Closed PO can't be amended** `P2 · NEG` — Expected: '<PO> is "closed" and can't be amended.'
- **AMD-13 · Month-to-date double counted at amendment** `P3 · EDGE` ⚠ Suspect — Pre: issued PO 9,000, MTD 45,000 incl. this PO. Steps: amend to 9,500. Expected: tier judged on true spend. Suspect: escalates to EVP.

Three-way match fallback (SOP §8.7)
- **FB-01 · Held over PO; PO amended up; re-check passes** `P1 · POS` — Pre: invoice 8,600 on PO 8,500 (exceeds_po), PR 9,500. Steps: amend PO 8,600 → Re-check. Expected: "Match passed — the invoice is ready for approval."
- **FB-02 · Held over GRN; more goods accepted; re-check passes** `P1 · POS` — Pre: FX-GRN-PART, invoice 8,500 (exceeds_grn). Steps: second DC+GRN for the rest → Re-check. Expected: matched.
- **FB-03 · No GRN; GRN accepted; re-check passes** `P1 · POS` — Expected: matched.
- **FB-04 · Re-check still failing** `P2 · NEG` — Expected: "Still on hold: …".
- **FB-05 · Return to vendor needs what to correct** `P2 · NEG` — Expected: "Enter what the vendor needs to correct."
- **FB-06 · Return to vendor** `P1 · POS` — Expected: returned; event "returned" with reason.
- **FB-07 · Revised invoice** `P1 · POS` — Pre: FB-06. Steps: Enter revised invoice (number pre-filled "<orig>/R1"), correct amount. Expected: new invoice matched; original shows superseded; "Enter revised invoice" hidden.
- **FB-08 · Revision can't reuse the number** `P2 · NEG` — Expected: duplicate_invoice_number.
- **FB-09 · Revising an invoice that wasn't returned** `P2 · NEG` — Expected: "Invoice "…" hasn't been returned to the vendor, so it can't be revised."
- **FB-10 · Revising twice (API)** `P3 · EDGE` ⚠ Suspect — Expected: second revision blocked. Suspect: allowed.
- **FB-11 · Approve with deductions (over GRN)** `P1 · POS` — Pre: invoice 8,500, GRN 5,100. Steps: FIN → "Approve ₹5,100 with deduction" (pre-filled "Billed for goods not accepted" 3,400). Expected: approved; approved_amount 5,100; payment must be 5,100.
- **FB-12 · Deductions: payable 0** `P2 · NEG` — Expected: "The payable amount must be greater than zero."
- **FB-13 · Deductions: payable above cap** `P2 · NEG` — Expected: "The payable amount can't be more than Rs. 5,100…"
- **FB-14 · Deductions: payable not below invoice** `P3 · NEG` — Expected: "…must be less than the invoice amount; otherwise approve it normally."
- **FB-15 · Deductions: blank reason** `P2 · NEG` — Expected: "Give a reason and an amount for every deduction."
- **FB-16 · Deductions don't add up** `P2 · NEG` — Expected: "Deductions add up to Rs. X, but the difference to explain is Rs. Y."
- **FB-17 · Deductions with no GRN** `P2 · NEG` — Expected: "No goods have been accepted yet, so nothing can be paid. Complete the GRN first."
- **FB-18 · Only Finance deducts** `P2 · SEC` — Steps: PO-OFF. Expected: "Only Finance can approve an invoice with deductions."
- **FB-19 · EVP deviation within ₹500** `P1 · POS` — Pre: PO 20,000 (PR 20,000 EVP-approved), invoice 20,400 (exceeds_po). Steps: FIN requests deviation → EVP approves → FIN approves → pays 20,400. Expected: event "Approved under EVP deviation."
- **FB-20 · Deviation exactly ₹500 / ₹501 on a ≤ ₹50,000 limit** `P1 · EDGE` — Expected: 500 eligible; 501 → "This difference (Rs. 501) is outside what can be accepted as a deviation…"
- **FB-21 · Deviation on a ₹1,00,000 limit (1%)** `P2 · EDGE` — Expected: 1,000 eligible; 1,002 not.
- **FB-22 · Deviation needs a reason / only on hold / one at a time** `P2 · NEG` — Expected: "Explain why this difference should be accepted." / "Only an on-hold invoice can go for a deviation." / "A deviation is already waiting for the EVP."
- **FB-23 · Requester can't decide the deviation** `P1 · SEC` — Expected: "You requested this deviation, so another approver must decide it."
- **FB-24 · EVP rejects deviation** `P2 · POS` — Expected: remarks required; invoice stays on hold; request button hidden.
- **FB-25 · Deviation re-requested after rejection (API)** `P3 · EDGE` ⚠ Suspect — Expected: blocked. Suspect: allowed.
- **FB-26 · Returned while deviation pending, then EVP approves** `P1 · EDGE` ⚠ Suspect — Expected: approval blocked. Suspect: returned invoice flips back to matched.
- **FB-27 · Re-check after an approved deviation** `P2 · EDGE` ⚠ Suspect — Expected: stays matched. Suspect: back on hold.
- **FB-28 · No-GRN hold is never a deviation** `P2 · NEG` — Expected: not eligible message.
- **FB-29 · Held invoices don't use up PO headroom** `P2 · EDGE` — Pre: invoice A 8,500 on hold. Steps: invoice B 8,500 with GRN. Expected: B matched.
- **FB-30 · Held more than 3 working days** `P3 · POS · ⏱` — Expected: "past the 3-day target" warning.
- **FB-31 · Event history** `P2 · POS` — Expected: each action (submitted, held, rechecked, returned, revised, superseded, deviation_*, approved*, paid) listed with labels.

---

## 11. TC-EMG — Emergency procurement (your item 8)

- **EMG-01 · Register an emergency request** `P1 · POS` — Steps: HOD-CSE → Emergency, cost 50,000, description, reason. Expected: "Emergency Request Submitted", "Logged in register (EMG-…). Awaiting EVP authorization."
- **EMG-02 · Required fields** `P2 · NEG` — Expected: "Please complete all required fields."; API cost 0 → "Estimated cost must be greater than zero."
- **EMG-03 · Blank description via API** `P3 · NEG` ⚠ Suspect — Expected: rejected. Suspect: saved.
- **EMG-04 · Over the annual cap** `P1 · NEG` — Steps: cost 10,00,001. Expected: banner "HARD BLOCK…", button disabled; API emergency_cap_exceeded.
- **EMG-05 · Exactly the cap** `P2 · EDGE` — Steps: 10,00,000. Expected: allowed.
- **EMG-06 · EVP authorises** `P1 · POS` — Pre: EMG-01. Expected: approved; "Annual ledger updated to ₹50,000."
- **EMG-07 · Ledger really accumulates** `P1 · POS` ⚠ Suspect — Pre: EMG-06. Steps: reload; `select running_total from emergency_annual_ledger`. Expected: 50,000; remaining 9,50,000. Suspect: stays 0 (ledger row can't be created through RLS).
- **EMG-08 · EVP can't authorise their own request** `P1 · SEC` — Expected: "You raised this emergency purchase, so another approver must decide it."
- **EMG-09 · Only the EVP authorises** `P1 · SEC` — Steps: PRIN calls approve. Expected: "Only the Executive Vice President (EVP) can authorize emergency purchases."
- **EMG-10 · Reject needs a reason** `P2 · NEG` — Expected: UI requires remarks.
- **EMG-11 · Approving twice** `P1 · EDGE` ⚠ Suspect — Steps: API approve an approved request. Expected: blocked. Suspect: cost added again.
- **EMG-12 · Pending requests and the cap** `P1 · EDGE` — Steps: two requests of 6,00,000; approve first. Expected: second approval → "Cannot approve: Annual ledger for 2026-27 would reach ₹12,00,000, exceeding ₹10,00,000."
- **EMG-13 · Post-facto 48-hour rule** `P2 · EDGE · ⏱` ⚠ Suspect — Expected: late ratification flagged/blocked per SOP. Suspect: only a server log line.
- **EMG-14 · Emergency-flag PR cap** `P2 · NEG` — Pre: emergency PRs totalling 9,90,000. Steps: emergency PR 20,000. Expected: "Emergency procurement this financial year would reach ₹10,10,000, above the annual cap…"
- **EMG-15 · Emergency PR approval authority** `P2 · EDGE` ⚠ Suspect — Expected (SOP §IX): EVP prior approval. Suspect: routed by normal matrix.
- **EMG-16 · Debarred vendor on an emergency request** `P2 · NEG` ⚠ Suspect — Expected: rejected. Suspect: accepted.
- **EMG-17 · Repeat-item anomaly** `P3 · POS` — Steps: two requests mentioning "toner". Expected: critical "Repeat-Pattern Anomaly Flagged".
- **EMG-18 · Keyword false positive** `P3 · EDGE` ⚠ Suspect — Steps: "toilet repair" + "boiler oil". Expected: no flag. Suspect: flagged for "oil".
- **EMG-19 · Department quota warning** `P3 · POS` — Expected: ≥ ₹4,00,000 in 90 days → warning.
- **EMG-20 · Frequency warning** `P3 · POS` — Expected: ≥3 requests with ≥2 gaps ≤ 14 days → warning.
- **EMG-21 · Quarterly audit export** `P2 · POS` ⚠ Suspect — Expected: CSV/PDF for the selected quarter with status. Suspect: CSV crashes; quarter ignored; PDF status blank.
- **EMG-22 · Budget effect of an emergency** `P3 · EDGE` — Expected: documented behaviour (currently none on budget heads or monthly spend); confirm with product owner.

---

## 12. Added areas you didn't list

### 12.1 TC-VND — Vendor governance and rating
- **VND-01 · Debarred vendors aren't offered in RFQ invites** `P1 · NEG`
- **VND-02 · Vendor debarred mid-order** `P2 · EDGE` — Expected: documented — existing PO continues through GRN/invoice/payment.
- **VND-03 · Rating ≥ 85 → preferred** `P3 · POS` — Expected: weighted score A×.25+B×.20+C×.15+D×.20+E×.10+F×.10.
- **VND-04 · Rating without section E** `P3 · EDGE` — Expected: score ÷ 0.9.
- **VND-05 · Score 40–54 suspends** `P2 · POS` — Expected: vendor suspended → can't be awarded.
- **VND-06 · Score < 40 by Procurement Officer** `P1 · NEG` — Expected: "A score below 40 debars this vendor, which only the Executive Vice President (EVP) can authorize. Send this rating to the EVP for countersignature."
- **VND-07 · Send debarment for countersignature** `P1 · POS` — Expected: "Debarment Recommendation Submitted"; vendor unchanged.
- **VND-08 · EVP countersigns with reference** `P1 · POS` — Expected: vendor debarred; blacklist row; notice email.
- **VND-09 · Reviewer can't countersign own review** `P1 · SEC`
- **VND-10 · Anyone can submit a rating** `P1 · SEC` ⚠ Suspect — Steps: FAC-CSE submits (API). Expected: rejected.
- **VND-11 · Good rating un-debars a vendor** `P1 · SEC` ⚠ Suspect — Steps: rate V-DEB 90. Expected: stays debarred without EVP.
- **VND-12 · Countersigning a non-debarment rating** `P2 · SEC` ⚠ Suspect — Expected: blocked.

### 12.2 TC-SEC — Access and data protection
- **SEC-01 · Pages opened by URL still block actions** `P1 · SEC` — Steps: FAC-CSE opens /procurement/invoices and tries Approve. Expected: server refuses.
- **SEC-02 · Vendor A's link can't show vendor B's quote** `P1 · SEC`
- **SEC-03 · Browser writes to procurement tables are denied** `P1 · SEC` — Steps: REST insert/update on purchase_orders, invoices, payments, budget_heads, rate_contracts with a staff token. Expected: denied.
- **SEC-04 · Editing roles in the browser grants nothing** `P1 · SEC` — Steps: change localStorage `amc_roles` to admin. Expected: server functions still use real roles.
- **SEC-05 · Emergency insert via REST can't self-approve** `P2 · SEC` — Expected: only pending rows insertable.

### 12.3 TC-NOT — Notifications
- **NOT-01 · RFQ invitation has the private link** `P1 · POS`
- **NOT-02 · Approver notified when a PO/CS is routed** `P2 · POS` ⚠ Suspect — Expected: link to the live site. Suspect: link is http://localhost:8080.
- **NOT-03 · Vendor told when goods are rejected** `P2 · POS`
- **NOT-04 · CS preparer told of the decision** `P3 · POS`
- **NOT-05 · Quotation email failure shows the reason** `P3 · NEG` — Steps: Request Quotation with a bad mail setup. Expected: red toast "…email delivery failed: <reason>".

### 12.4 TC-UI — Cross-cutting UI
- **UI-01 · Turnaround panel on My Approvals counts late items** `P3 · POS`
- **UI-02 · Light and dark mode on PR, PO, GRN, Invoice, Approvals pages** `P3 · POS`
- **UI-03 · Phone width (375 px) on the vendor quotation page** `P2 · POS`
- **UI-04 · Filters and pagination agree** `P3 · POS`
- **UI-05 · Labels are readable (no snake_case codes)** `P3 · POS`

### 12.5 TC-RPT — Documents and exports
- **RPT-01 · PO PDF matches the PO** `P2 · POS`
- **RPT-02 · GL export uses the payable amount** `P2 · POS` ⚠ Suspect — Expected: correct tax split from the invoice GSTIN. Suspect: full PO taxes, fake fallback GSTIN.

---

## 13. Traceability to your list

| Your item | Section |
|---|---|
| 1 Normal direct purchase | 4 TC-DP |
| 2 Negative direct purchase | 5 TC-DPN |
| 3 Direct purchase PO amendments | 6 TC-DPA |
| 4 Three-way purchase, normal | 7 TC-3W |
| 5 Three-way purchase, negative | 8 TC-3WN |
| 6 Routine consumables / rate contracts (before, after, first purchase, using) | 9 TC-RC (RC-30…RC-35) |
| 7 PO amendments, three-way fallback | 10 TC-AMD, TC-FB |
| 8 Budget setup, emergency, budget calculations | 2 TC-BUD, 11 TC-EMG |
| Added | 1 TC-SET, 3 TC-PR, 12 TC-VND / SEC / NOT / UI / RPT |
