# The Fish Tank — Vision (North Star)

> **Status:** Long-term vision, not current scope. Current focus: **organizing the coral
> inventory** — cataloging corals tank-by-tank with plug/rack tagging, then the review → go-live
> path for those drafts.
> For what's actually built today, see REALITY_MAP.md. Read both together.

## Core Vision Statement

The Fish Tank is the single internal system of record for an aquarium / coral retail store —
every coral, fish, invert, and dry good, **where it physically sits**, what it costs, and what's
being marketed — so the team stops relying on memory and scattered spreadsheets and can run the
store from one organized workspace.

## The Problem

Store operations are disorganized. Livestock (especially corals) isn't systematically tracked;
"where is it on the rack" lives in people's heads; pricing approvals happen ad hoc; and marketing
is disconnected from what's actually in stock. New inventory comes in faster than it gets
catalogued, so nobody has a trustworthy picture of what the store has, where it is, or what it's
worth.

## Roadmap (phases — direction, not commitments)

1. **Foundation — organize the corals (current focus).** Catalog corals system-by-system with
   photos, names, and **plug/rack tags** so every coral has a known location. Close the loop with
   a review → go-live path so a catalogued coral can be priced and made available cleanly.
2. **Whole-store inventory.** Extend the same disciplined intake + tagging to fish, inverts, live
   rock, and dry goods, so the entire floor is in the system.
3. **Sales / POS integration.** Once inventory is stable and trustworthy, read-sync with Clover so
   stock and sales stay aligned.
4. **Customer-facing.** Public catalog, live sales, and marketing all driven by real, current
   stock — not a separate manual list.

## Principles (non-negotiable)

- **Accuracy over volume.** A coral isn't "in the system" until it's photographed, tagged, and
  located. Fewer correct records beat many vague ones.
- **Review before live.** Nothing customer-facing (pricing, availability) goes live without a
  human approval gate.
- **One source of truth.** The repo and the live database stay in lock-step via versioned
  migrations — no out-of-band dashboard edits.
- **Manual first, automate later.** Get the workflow right by hand on one tank before building
  bulk automation or external syncs.

## Recommended MVP

Catalog one coral system end-to-end (start with **C-40100**): every coral photographed, named,
plug-tagged, and located — and an admin can take at least one of them fully live through the
pricing-review gate. That proves the whole loop: discover → tag → review → live.
