# Brake Supplier Attribute Descriptions

The brake supplier dataset uses the same 18 risk scores, Total Risk Index and operational metrics as the main
dataset (see `data/eval/source/supplier_risk_criteria.md`). All scores: 0 = no risk, 100 = maximum risk. This
document describes the additional attributes.

All suppliers and values are simulated. Company names are invented.

## 1. Supplier Attributes (`brake_suppliers.csv`)

- **Country:** Country of the supplier's main production site.
- **Region:** EU, Europe (non-EU), North America, South America or Asia-Pacific.
- **Supplier Status:** Approved (in the supplier base with order history) or Prospect (not yet onboarded; Purchase Order Volume is 0 and Order Change Rate, Supplier Delivery Rating and Order Confirmation Rate are empty).
- **Certifications:** Semicolon-separated list. Possible values:
  - ISO 9001: quality management system.
  - IATF 16949: automotive quality management (passenger car and commercial vehicle).
  - ECE R90: UN regulation for replacement brake pads and discs (passenger car).
  - ISO/TS 22163: railway quality management (formerly IRIS).
  - ISO 14001: environmental management system.
  - ISO 45001: occupational health and safety management system.

## 2. Offering Attributes (`brake_offerings.csv`)

- **offeringID:** Supplier ID plus a running number, e.g. BRK_0001-01.
- **Commodity:** Always Brakes in this dataset.
- **Product Type:** Disc brake pads, Brake discs, Brake calipers, Air disc brake pads, Drum brake assemblies, Rail brake pads, Composite brake blocks, Rail brake discs, Spring-applied brakes, Hydraulic caliper brakes, Yaw brake pads, Rotor brake calipers.
- **Application:** Passenger car, Commercial vehicle, Rail, Industrial or Wind turbine.
- **Material:** Friction material or construction, e.g. Low-metallic, Ceramic, Sintered, Organic composite, Grey cast iron.
- **Copper Free:** Yes / No for friction products (pads and blocks); empty otherwise. Yes means copper content below 0.5% by weight.
- **Unit Price (EUR):** Quoted price per unit, excluding freight, duties and tooling.
- **MOQ (units):** Minimum order quantity per order.
- **Lead Time (days):** Quoted lead time from order to dispatch.
- **Annual Capacity (units):** Units per year the supplier can commit for this product.
