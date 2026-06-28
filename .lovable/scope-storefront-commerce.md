# Parked scope: storefront commerce, customer portal & order fulfillment (FUTURE — not in scope)

> Direction, not scope. Captured so it isn't lost. **Do not build without explicit sign-off.** The NOW slice
> (item availability model + display + publish) is specced separately in `handoff-storefront-availability.md`.

## Why this exists
We don't want to lose a sale when the website says "sold out" but we can have the item in-store by a known
day. The public experience should feel like Amazon: **order now, pick up [date]** — no friction, no "special
order" label. The re-ordering logistics are a back-of-house concern, not the customer's.

## The future build (sequenced, post-catalog)
1. **Checkout / payment layer.** Today the "Add to cart" is a shell — there is no cart, checkout, or payment.
   Real ordering (in-stock OR order-ahead) requires this. Largest dependency; everything below needs it.
2. **Order-ahead fulfillment.** When a customer orders an item that isn't physically here (out-of-stock but
   sourceable, or special-order-only), it must surface in an **admin "to-order / fulfillment" view** — the
   owner's "here's everything I need to order this week" list, keyed off the store order-cycle (order by
   [cutoff] → ready [day]). **Foundation already exists:** the Restock view (`/inventory/restock`) lists
   sold-out stock to re-order; the customer-ordered version is its natural evolution.
3. **Customer accounts / portal.** Profiles, order history, pickup scheduling, notifications ("your order is
   ready"). Order-ahead and perks likely gate behind being signed in.
4. **Membership / rewards tier.** Annual membership as the home for perks — e.g. order-ahead, deposits,
   priority on incoming livestock. Deposit-vs-pay-in-full mechanics live here. Needs its own design pass.

## Explicitly NOT now
No checkout, no payment, no accounts, no membership, no real order capture, no fulfillment view. The buy
button stays a shell until phase 1 lands. The NOW slice only makes items **persist + show their pickup ETA**.
