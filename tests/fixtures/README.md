# Source evidence

Fetched October 26, 2026. Public carrier data only.

- `ups-ca-2026-10-26.json`: https://assets.ups.com/adobe/assets/urn:aaid:aem:e29054f3-9c5b-45cf-a548-99ec4d4b7799/original/as/ca.json
  This is the Canada resource selected by UPS's own https://www.ups.com/webassets/blocks/table/table.js renderer. The old `/assets/resources/fuel-surcharge/ca.json` URL still returns September 2025 data and must not be used. Tests cover both endpoints of each cent-denominated interval (120 points).
- `canada-post-2026-10-26.html`: only the October 19 and October 26 tables from https://www.canadapost-postescanada.ca/cpc/en/support/kb/company-policies/rates-taxes-surcharges/fuel-surcharges-on-mail-and-parcels.page

Regression fixtures are dated examples, not live rate sources. Live jobs reject UPS/Canada Post histories without this week's and last week's effective rows.
