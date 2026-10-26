# PnP Fuel Tracker

Publishes carrier fuel rates, with automatic source checks and visible last-known fallback.

## Sources and trust

- UPS: the official Canadian published history JSON used by UPS's own website, including International. Current and previous effective weeks are mandatory. The existing UPS quote API is an independent cross-check for its three covered rows. Formula recalibration is no longer needed to publish UPS rates.
- Canada Post: the table for the current Toronto calendar week. The unstruck value is charged; the struck value is `listRate`. Ambiguous cells or missing weeks fail closed. Previous is the actual preceding week's charged rate, including the first migration and same-week retries.
- FedEx and Purolator: published service-period tables first, existing carrier APIs as fallback. Purolator uses monthly effective periods. Missing source history suppresses the comparison rather than inventing it.
- Canpar: its public endpoint. Loomis: its own domestic and worldwide tables, including the preceding effective week.

The rate engine remains a diagnostic cross-check. Its drift does not replace an authoritative published rate. Published UPS/API conflicts create an exception.

## Automation

GitHub refreshes Mondays at 11:00 UTC, and after merged source changes. Runs serialize. Dependencies use the reviewed lockfile with lifecycle scripts disabled; regression tests run before publishing. Data is written atomically. Existing secrets stay in GitHub.

Verification findings stay in the workflow run log; no automatic exception issues or added alert permissions. Existing GitHub notification settings remain unchanged. A total GitHub outage cannot report itself: the widget treats data older than seven days, or not verified in the current week, as stale.

The separately approved business-box cron runs `ops/fuel-sync.py --apply` once on Monday at 11:05 UTC with `--wait-current-week`. It waits up to 20 hours for the new weekly publication and synchronizes within five minutes of detecting it. It refreshes only the fuel widget's server-rendered rows, includes temporary list rates and mobile change indicators, and backs up/readbacks WordPress changes. It has a dry-run default. See DEPLOY.md for the one-time installation and rollback.

This removes routine weekly edits. Carrier schema changes, credential outages or conflicting published rates remain exceptions requiring investigation; stale labels stay visible until verified.

## Checks

`npm ci --ignore-scripts`, then `npm test` and `python3 -m unittest discover -s tests -p 'test_*.py'`.

`FUEL_OUTPUT_FILE=/absolute/path/to/copied-fuel-rates.json node fetch-and-build.js` runs a local source check without touching the tracked feed. Without API secrets the public page readers can still verify rates. Both direct and rendered reads are validated. On GitHub runners, the existing Google Chrome binary supplies a bounded browser fallback; no new package, browser account or credential is installed. If both public reads and API fallback fail, last-known rates remain visibly dated.
