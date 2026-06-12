"""Database connection helper — reads DATABASE_URL from environment."""
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL", "")


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()


def fetch_all(sql: str, params=None) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def fetch_one(sql: str, params=None) -> dict | None:
    rows = fetch_all(sql, params)
    return rows[0] if rows else None
