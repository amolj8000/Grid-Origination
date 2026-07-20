#!/usr/bin/env python3
"""
Seed ERCOT SCED dispatch data for a single calendar month.
Runs directly from the PyPSA venv — no web server required.

Usage:
  python3 seed_month.py <year> <month>

Examples:
  python3 seed_month.py 2026 6    # June 2026
  python3 seed_month.py 2026 5    # May 2026
  python3 seed_month.py 2025 12   # December 2025
"""
import sys
import os
import datetime
import time
import logging
import calendar

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("seed_month")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    year  = int(sys.argv[1])
    month = int(sys.argv[2])

    start_date = datetime.date(year, month, 1)
    last_day   = calendar.monthrange(year, month)[1]
    end_date   = min(
        datetime.date(year, month, last_day),
        datetime.date.today() - datetime.timedelta(days=1),  # never request future dates
    )

    if start_date > end_date:
        logger.error("Start date %s is after end date %s — nothing to seed.", start_date, end_date)
        sys.exit(0)

    logger.info("Seeding SCED dispatch: %s → %s", start_date, end_date)

    # ── DB connection ────────────────────────────────────────────────────────
    import psycopg2
    import psycopg2.extras

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL not set.")
        sys.exit(1)
    conn = psycopg2.connect(db_url)

    # ── Already-seeded dates ────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute(
            "SELECT seed_date FROM ercot_dispatch_seed_log WHERE rows_inserted >= 0"
            "  AND seed_date >= %s AND seed_date <= %s",
            (start_date, end_date),
        )
        already = {r[0] for r in cur.fetchall()}

    dates_needed = []
    d = start_date
    while d <= end_date:
        if d not in already:
            dates_needed.append(d)
        d += datetime.timedelta(days=1)

    if not dates_needed:
        logger.info("All days in %d-%02d already seeded. Nothing to do.", year, month)
        conn.close()
        sys.exit(0)

    logger.info("%d days to seed, %d already done.", len(dates_needed), len(already))

    # ── ERCOT API ────────────────────────────────────────────────────────────
    import concurrent.futures
    from gridstatus.ercot_api.ercot_api import ErcotAPI

    logger.info("Connecting to ERCOT API…")
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        api = ex.submit(
            lambda: ErcotAPI(
                username=os.environ.get("ERCOT_USERNAME"),
                password=os.environ.get("ERCOT_PASSWORD"),
                public_subscription_key=os.environ.get("ERCOT_SUBSCRIPTION_KEY"),
            )
        ).result(timeout=60)
    logger.info("ERCOT API connected.")

    # ── Import seeder helpers ────────────────────────────────────────────────
    sys.path.insert(0, os.path.dirname(__file__))
    from dispatch_seeder import _seed_one_day

    # ── Seed day by day ──────────────────────────────────────────────────────
    total_rows = 0
    errors     = 0

    for i, date in enumerate(dates_needed, 1):
        t0 = time.time()
        n  = _seed_one_day(api, conn, date)
        elapsed = time.time() - t0

        if n >= 0:
            total_rows += n
            logger.info("[%d/%d] %s — %d rows in %.1fs", i, len(dates_needed), date, n, elapsed)
        else:
            errors += 1
            logger.warning("[%d/%d] %s — error (skipped)", i, len(dates_needed), date)

        time.sleep(0.5)

    conn.close()
    logger.info(
        "Done: %d/%d days seeded, %d rows inserted, %d errors.",
        len(dates_needed) - errors, len(dates_needed), total_rows, errors,
    )


if __name__ == "__main__":
    main()
