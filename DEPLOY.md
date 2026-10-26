# Reviewed rollout (explicit approval required)

## What changes

Merge PR1 after regression CI and review. Merged source changes automatically start a refresh using existing GitHub API secrets. The workflow requests `contents: write` for the existing data commit. It never sends email directly, changes credentials, or authorizes an agent to deploy repairs.

The business-box changes below are separate from merging. Do not call a prepared script installed or an unrun workflow healthy.

## Acceptance and installation

1. Verify the approved head SHA, CI, and remote branch before merge. After merge inspect the refresh run. If a scheduled old run was already queued, explicitly dispatch the workflow on `main` so the corrected source runs. Verify all seven carriers, UPS International 42.25% and Canada Post 40.30%/47.50% for the October 26 week, proper source dates and no unexpected stale/conflict rows. Later dates must use current official source values, not these examples.
2. On business-box, preserve the existing `/usr/local/bin/pnp-fuel-sync`, `/etc/cron.d/pnp-fuel-sync` and the full Elementor data for post 1710 in a private dated backup. Obtain the approved repository files through a clean pinned checkout; do not overwrite an unrelated dirty tree. Install `ops/fuel-sync.py` root-owned as `/usr/local/bin/pnp-fuel-sync` (0755).
3. Run `/usr/local/bin/pnp-fuel-sync --install-widget /path/to/approved/pnp-fuel-tracker-embed.html` first in dry-run. Then add `--apply` for the approved one-time widget upgrade. It touches only widget 450cb46f, saves the complete old Elementor value, rejects a detected concurrent edit and verifies the saved data. Inspect all page widgets before/after. Do not rerun a whole-widget replacement in routine cron.
4. Replace the existing cron entry with `ops/pnp-fuel-sync.cron` (0644, root-owned). Run the exact cron command once, then again to confirm no-op behavior. Verify customer page and HTML source on desktop and 375px/390px phone widths; test data-fetch failure keeps saved rows visibly stale. Compare cached/public pages with origin; confirm the temporary note and source dates agree. Check `/var/log/pnp-fuel-sync.log` after the next scheduled invocation.
5. Inspect verification diagnostics in the run log. No automatic exception issues are created. Actual full-source credentialed execution and the next cron invocation are release acceptance, not implied by local tests.

## Rollback

Disable the new cron first if its write path is faulty. Restore the saved script and cron files. Restore the saved Elementor JSON using `wp post meta update 1710 _elementor_data` under the existing WordPress user, only after confirming no newer human edits would be overwritten; read it back and purge the page cache. Preserve newer edits by restoring only the fuel widget when necessary. GitHub rollback uses a reviewed revert PR; do not force-push or restore old incorrect rates as current. If data cannot be verified, keep last-known values visibly stale.

## Known limits

GitHub scheduled jobs can start late. The Monday-only cadence is intentional; seven-day age and current-week checks prevent indefinite green status. The existing daily server-copy sync can pick up a delayed Monday publication on Tuesday. The server cron synchronizes the published feed, not the carrier API credentials. A complete GitHub outage needs the normal infrastructure response; this change does not introduce a second credential store or scheduler account.
