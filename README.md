# Comprehensive Merchandise

A full-stack e-commerce demo with a customer storefront, admin dashboard,
**simulated GPS order tracking**, automated + manual notifications, product
reviews with moderation, and a customer support desk.

Built with **zero external dependencies** — pure Node.js backend (built-in
`http`, `crypto`, `fs`) and a vanilla JS/HTML/CSS frontend. Runs anywhere
Node is installed.

## Quick start

```bash
node server/server.js
```

Then open **http://localhost:3000** in your browser.

A `data/db.json` file is created automatically on first run with seed data.
Delete it to reset everything to the original demo state.

### Demo accounts

| Role     | Email                                  | Password     |
|----------|-----------------------------------------|--------------|
| Admin    | admin@comprehensivemerchandise.com       | admin123     |
| Customer | jordan@example.com                       | customer123  |

You can also register new customer accounts from the site.

## Features

### Storefront
- Product catalog with search, categories, and detail pages
- Cart, checkout (creates an order — no real payment processing)
- Order history per customer

### Admin dashboard (`/#/admin`, admin login required)
- **Overview** — store stats (orders, revenue, active simulations, pending reviews, open tickets)
- **Products** — post new listings, edit price/stock, delete listings
- **Orders & Tracking** — view every order and control its simulated shipment:
  - **Start** — begins the timer-driven GPS simulation
  - **Pause** — freezes the dot in place
  - **Resume** — continues from where it paused
  - **Reset** — generates a fresh route/tracking number and restarts from "Processing"
  - Adjustable tick interval (how often the dot moves)
- **Notifications** — send a message to one customer or broadcast to all
- **Reviews** — approve or hide submitted reviews
- **Support** — reply to and close customer tickets

### Simulated tracking
Every order is assigned a fake tracking number and a generated route (start
point → waypoints → destination, as lat/lng). While "running," a timer moves
the position along the route and advances the status through:
`Processing → Shipped → In Transit → Out for Delivery → Delivered`.
Each status change automatically creates a notification for the customer.
Customers see a live progress bar and route map on their order page (polls
every 5 seconds).

### Reviews & support
- Customers leave star ratings + comments on products they've purchased
  (flagged as "verified purchase")
- New reviews are **pending** until an admin approves them
- Support tickets with threaded replies between customer and admin, plus a
  basic FAQ section

## Project structure

```
comprehensive-merchandise/
├── server/
│   ├── server.js     # HTTP server + all API routes
│   ├── db.js         # JSON-file database + password hashing
│   ├── auth.js       # signed-token auth (login/session)
│   └── tracking.js   # simulated GPS tracking engine
├── public/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── api.js     # fetch wrapper for the API
│   │   ├── state.js   # cart/auth/toast state
│   │   ├── views.js    # customer pages
│   │   ├── admin.js    # admin dashboard
│   │   └── app.js      # hash router
│   └── images/         # placeholder product images (SVG)
└── data/
    └── db.json         # auto-created on first run
```

## Notes & next steps for production

- **Database**: replace `db.json` with a real database (Postgres, MongoDB) —
  the `db.js` module is intentionally isolated so this is a single-file swap.
- **Payments**: checkout currently just records the order. Integrate Stripe
  or similar before going live.
- **Auth**: token signing uses HMAC with a default secret — set the
  `AUTH_SECRET` environment variable to a strong random value in production.
- **Maps**: the tracking page shows a simple progress bar with lat/lng
  coordinates. Swap in a real map provider (Mapbox/Leaflet/Google Maps) for a
  visual map.
- **Email/SMS**: notifications are in-app only. Add an email/SMS provider for
  external delivery.
