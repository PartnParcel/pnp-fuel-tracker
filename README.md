# PnP Fuel Tracker

Publishes carrier fuel rates, with automatic source checks and visible last-known fallback.

## Sources and trust

- UPS: the official Canadian published history JSON used by UPS's own website, including International. Current and previous effective weeks are mandatory. The existing UPS quote API is an independent cross-check for its three covered rows. Formula recalibration is no longer needed to publish UPS rates.
- Canada Post: the table for the current Toronto calendar week. The unstruck value is charged; the struck value is `listRate`. Ambiguous cells or missing weeks fail closed. Previous is the actual preceding week's charged rate, including the first migration and same-week retries.
- FedEx and Purolator: existing carrier APIs. If unavailable, retain last-known rates as stale; never label an unverified formula result as verified.
- Canpar and Loomis: existing public carrier sources.

The rate engine remains a diagnostic cross-check. Its drift does not replace an authoritative published rate. Published UPS/API conflicts create an exception.

## Automation

GitHub refreshes hourly on Mondays at minute 17, twice daily on other days, and after merged source changes. Runs serialize. Dependencies use the reviewed lockfile with lifecycle scripts disabled; regression tests run before publishing. Data is written atomically. Existing secrets stay in GitHub.

One GitHub exception issue opens when source checks or publication fail. It changes only when the problem changes and closes after recovery. GitHub manages notifications; this is not a new email sender. A total GitHub outage cannot report itself: the widget independently treats data older than 36 hours, or not verified in the current week, as stale.

The separately approved business-box cron runs `ops/fuel-sync.py --apply` hourly. It refreshes only the fuel widget's server-rendered rows, includes temporary list rates and mobile change indicators, and backs up/readbacks WordPress changes. It has a dry-run default. See DEPLOY.md for the one-time installation and rollback.

This removes routine weekly edits. Carrier schema changes, credential outages or conflicting published rates remain exceptions requiring investigation; stale labels stay visible until verified.

## Checks

`npm ci --ignore-scripts`, then `npm test` and `python3 -m unittest discover -s tests -p 'test_*.py'`.

`FUEL_OUTPUT_FILE=/absolute/path/to/copied-fuel-rates.json node fetch-and-build.js` runs a local source check without touching the tracked feed. With no API secrets, FedEx/Purolator correctly remain stale; that is not proof of the credentialed production path.
