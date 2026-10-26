#!/usr/bin/env python3
"""Refresh the crawler-visible copy of the fuel surcharge table.

The table on https://partnparcel.com/canadian-fuel-surcharge-tracker/ is drawn in
the visitor's browser from fuel-rates.json, so a crawler that does not run
JavaScript sees an empty table. This writes the current rows into the page HTML
as well, which is what Google and the AI assistants actually read. The browser
still overwrites the tbody on load, so a human always sees live numbers.

Runs on the business box from cron, right after the weekly GitHub job commits new
rates. Idempotent: writes only when the rendered rows actually differ.
"""
import json
import re
import subprocess
import sys
import urllib.request
import argparse
import datetime
import pathlib
import fcntl
import hashlib
import time
from zoneinfo import ZoneInfo

FEED = "https://raw.githubusercontent.com/PartnParcel/pnp-fuel-tracker/main/fuel-rates.json"
DOCROOT = "/home/partnparcel/htdocs/partnparcel.com"
POST_ID = "1710"
WIDGET_ID = "450cb46f"
TBODY = re.compile(r'(<tbody id="pnp-fuel-tbody">)([\s\S]*?)(</tbody>)')


def wp(*args):
    cmd = ["sudo", "-u", "partnparcel", "wp"] + list(args)
    r = subprocess.run(cmd, cwd=DOCROOT, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        sys.exit("wp %s failed: %s" % (args[0], r.stderr.strip()[:300]))
    return r.stdout


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def pct(v):
    return ("%.2f%%" % v) if isinstance(v, (int, float)) else "pending"


def render(data):
    """Mirror the widget's own renderer so the two copies agree."""
    rows = []
    for car in data["carriers"]:
        svcs = car["services"]
        span = len(svcs)
        cadence = "resets monthly" if car.get("cadence") == "monthly" else "resets weekly"
        status = car.get("status")
        now = datetime.datetime.now(datetime.timezone.utc)
        today = now.astimezone(ZoneInfo('America/Toronto')).date()
        week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()
        if not car.get('lastVerified') or car['lastVerified'] < week_start or any(s.get('effectiveTo', '9999-12-31') < today.isoformat() for s in svcs):
            status = 'stale'
        try:
            stamp = datetime.datetime.fromisoformat(data['generatedAt'].replace('Z', '+00:00'))
            age = (now - stamp).total_seconds() / 3600
            if not 0 <= age <= 168:
                status = 'stale'
        except (KeyError, ValueError, TypeError):
            status = 'stale'
        label = {"stale": "last verified", "failed": "source failed"}.get(status, "checked")
        cls = status if status in ("stale", "failed") else ""
        for i, s in enumerate(svcs):
            cells = ""
            if i == 0:
                cells += (
                    '<td class="carrier" rowspan="%d">'
                    '<a href="%s" target="_blank" rel="noopener noreferrer">%s'
                    '<span class="pnp-ext-icon">↗</span></a>'
                    '<span class="pnp-verified %s"><span class="pnp-verified-dot"></span>'
                    "%s %s · %s</span></td>"
                ) % (span, esc(car["url"]), esc(car["name"]), cls,
                     label, esc(car["lastVerified"]), cadence)
            cur, prev = s.get("current"), s.get("previous")
            change = ""
            if isinstance(cur, (int, float)) and isinstance(prev, (int, float)):
                delta = cur - prev
                if abs(delta) < 0.005:
                    change = '<span class="ch-flat">No change</span>'
                elif delta > 0:
                    change = ('<span class="ch-up"><span class="ch-arrow">▲</span> '
                              "Up %.2f%%</span>" % abs(delta))
                else:
                    change = ('<span class="ch-down"><span class="ch-arrow">▼</span> '
                              "Down %.2f%%</span>" % abs(delta))
            note = ''
            if isinstance(s.get('listRate'), (int, float)):
                note = '<span class="pnp-list-rate">Temporary rate · list <s>%s</s></span>' % pct(s['listRate'])
            if s.get('effectiveDate') and s.get('effectiveTo'):
                note += '<span class="pnp-list-rate">Applies %s–%s</span>' % (esc(s['effectiveDate']), esc(s['effectiveTo']))
            compact = '<span class="ch-inline">%s</span>' % change
            cells += (
                '<td class="service">%s</td><td class="num">%s%s%s</td>'
                '<td class="num hide-mobile">%s</td><td class="change">%s</td>'
            ) % (esc(s["service"]), pct(cur), note, compact,
                 pct(prev) if isinstance(prev, (int, float)) else "", change)
            rows.append('<tr class="%s">%s</tr>'
                        % ("last-of-group" if i == span - 1 else "", cells))
    return "".join(rows)


STAMP = re.compile(r'<!-- pnp-fuel-generated-at: ([^ ]+) -->')

def replace_rows(html, source, body, generated_at=None):
    """Never replace a newer published snapshot with an older cached response."""
    old = STAMP.search(html)
    if generated_at:
        incoming = datetime.datetime.fromisoformat(generated_at.replace('Z', '+00:00'))
        if old and incoming < datetime.datetime.fromisoformat(old.group(1).replace('Z', '+00:00')):
            return html
    result = TBODY.sub(lambda m: m.group(1) + body + m.group(3), source)
    if generated_at:
        result = STAMP.sub('', result)
        result = result.replace('<tbody id="pnp-fuel-tbody">', '<!-- pnp-fuel-generated-at: %s -->' % esc(generated_at) + '<tbody id="pnp-fuel-tbody">', 1)
    return result


def mark_stale(body):
    """Change verification labels only; preserve all saved rates and markup."""
    body = re.sub(r'class="pnp-verified(?: stale| failed)? ?"',
                  'class="pnp-verified stale"', body)
    return re.sub(r'(?<!last )verified (?=\d{4}-)', 'last verified ', body)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wait-current-week', action='store_true', help="Monday job waits for this week's published feed, up to 20 hours")
    parser.add_argument('--apply', action='store_true', help='Write the reviewed change; otherwise dry-run')
    parser.add_argument('--install-widget', type=pathlib.Path, help='One-time upgrade of the exact fuel widget only')
    parser.add_argument('--data', type=pathlib.Path, help='Local reviewed feed for dry-run only')
    args = parser.parse_args()
    if args.data and args.apply:
        sys.exit('Local fixture data is dry-run only')
    lock = open('/tmp/pnp-fuel-sync.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    data = {}
    body = None
    try:
        if args.data:
            data = json.loads(args.data.read_text())
        else:
            deadline = time.monotonic() + (20 * 3600 if args.wait_current_week else 0)
            while True:
                try:
                    request = urllib.request.Request(FEED + '?sync=' + str(int(time.time())), headers={'Cache-Control': 'no-cache'})
                    with urllib.request.urlopen(request, timeout=30) as r:
                        data = json.load(r)
                    today = datetime.datetime.now(ZoneInfo('America/Toronto')).date()
                    week = (today - datetime.timedelta(days=today.weekday())).isoformat()
                    if not args.wait_current_week or data.get('generatedAt', '')[:10] >= week:
                        break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline:
                        raise
                if time.monotonic() >= deadline:
                    raise ValueError('No current-week publication within Monday wait window')
                time.sleep(300)

        if not data.get('carriers'):
            raise ValueError('feed has no carriers')
        body = render(data)
    except (OSError, ValueError, KeyError, TypeError) as error:
        if args.install_widget or args.data:
            sys.exit('Cannot install from an invalid feed: %s' % error)
        print('fuel-sync: feed unavailable; marking saved rows stale', file=sys.stderr)

    raw = wp("post", "meta", "get", POST_ID, "_elementor_data")
    tree = json.loads(raw)

    target = []

    def walk(nodes):
        for el in nodes:
            if el.get("id") == WIDGET_ID:
                target.append(el)
            walk(el.get("elements") or [])

    walk(tree)
    if len(target) != 1:
        sys.exit("expected exactly one widget %s, found %d" % (WIDGET_ID, len(target)))

    html = target[0]["settings"].get("html", "")
    if not TBODY.search(html):
        sys.exit("tbody marker missing from widget html, refusing to write")

    accepted_timestamp = data.get("generatedAt") if body is not None else None
    if body is None:
        body = mark_stale(TBODY.search(html).group(2))
    source = args.install_widget.read_text() if args.install_widget else html
    if len(TBODY.findall(source)) != 1:
        sys.exit('Expected one fuel tbody in replacement widget')
    new_html = replace_rows(html, source, body, accepted_timestamp)
    if new_html == html:
        print("fuel-sync: already current (%s)" % data.get("generatedAt", "?"))
        return

    target[0]["settings"]["html"] = new_html
    if not args.apply:
        print('fuel-sync: dry-run; would update %d rows, feed %s' % (body.count('<tr'), data.get('generatedAt')))
        return
    # Back up the complete Elementor value and reject edits made while fetching.
    backup = pathlib.Path('/var/backups/pnp-fuel-sync')
    backup.mkdir(mode=0o700, parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(raw.encode()).hexdigest()
    path = backup / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + fingerprint[:12] + '.json')
    path.write_text(raw)
    path.chmod(0o600)
    if wp('post', 'meta', 'get', POST_ID, '_elementor_data') != raw:
        sys.exit('Concurrent WordPress edit; retry next scheduled run')
    wp("post", "meta", "update", POST_ID, "_elementor_data",
       json.dumps(tree, separators=(",", ":")))
    saved = json.loads(wp('post', 'meta', 'get', POST_ID, '_elementor_data'))
    if saved != tree:
        sys.exit('WordPress readback differs; backup: %s' % path)
    subprocess.run(["sudo", "-u", "partnparcel", "wp", "cache", "flush"],
                   cwd=DOCROOT, capture_output=True, text=True, timeout=60)
    wp('eval', 'delete_post_meta(1710, "_elementor_element_cache"); do_action("litespeed_purge_post", 1710);')
    print("fuel-sync: updated from %s (%d rows)"
          % (data.get("generatedAt", "?"), body.count("<tr")))


if __name__ == "__main__":
    main()
