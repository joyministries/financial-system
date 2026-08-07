#!/usr/bin/env python3
"""Verify PayFast sandbox credentials produce a valid signature.

Usage:
    python scripts/check_payfast.py                 # uses .env credentials
    python scripts/check_payfast.py MERCHANT_ID MERCHANT_KEY PASSPHRASE   # explicit id/key/passphrase

Expected output when credentials are valid:
    HTTP 200  <- PayFast accepted the form (redirect page)

HTTP 400 with "signature does not match" means the credentials are invalid
for the sandbox (account not activated, key from another account, or the
passphrase does not match what is set on the PayFast dashboard at
Settings -> Integration -> Passphrase).
"""
import hashlib
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PROCESS_URL = "https://sandbox.payfast.co.za/eng/process"


def load_env(path=".env"):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v
    return env


def make_signature(fields, passphrase):
    query = urllib.parse.urlencode(sorted(fields.items()))
    if passphrase:
        query += "&passphrase=" + urllib.parse.quote_plus(passphrase)
    return hashlib.md5(query.encode()).hexdigest()


def post(fields, signature):
    body = dict(fields)
    body["signature"] = signature
    data = urllib.parse.urlencode(body).encode()
    req = urllib.request.Request(
        PROCESS_URL, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def main():
    if len(sys.argv) >= 4:
        merchant_id, merchant_key, passphrase = sys.argv[1], sys.argv[2], sys.argv[3]
    else:
        env = load_env()
        merchant_id = env.get("PAYFAST_MERCHANT_ID", "")
        merchant_key = env.get("PAYFAST_MERCHANT_KEY", "")
        passphrase = env.get("PAYFAST_PASSPHRASE", "")

    if not merchant_id or not merchant_key:
        print("ERROR: merchant_id / merchant_key missing (check .env or pass args)")
        return 1

    print(f"Testing merchant_id={merchant_id} key={merchant_key} passphrase_len={len(passphrase)}")
    fields = {
        "merchant_id": merchant_id,
        "merchant_key": merchant_key,
        "return_url": "http://localhost:8000/api/v1/payfast/return",
        "cancel_url": "http://localhost:8000/api/v1/payfast/cancel",
        "notify_url": "http://localhost:8000/api/v1/payfast/itn",
        "amount": "100.00",
        "item_name": "Test Item",
        "item_description": "Test",
        "name_first": "John",
        "name_last": "Doe",
        "email_address": "test@example.com",
    }

    # 1) with the given passphrase
    status = post(fields, make_signature(fields, passphrase))
    print(f"with passphrase      -> HTTP {status} {'OK' if status == 200 else '(400 = credential problem)'}")

    # 2) with NO passphrase (rules out a passphrase mismatch)
    if passphrase:
        status0 = post(fields, make_signature(fields, ""))
        print(f"without passphrase   -> HTTP {status0} {'OK' if status0 == 200 else '(still 400 = bad id/key pair)'}")

    return 0 if (status == 200 or (passphrase and status0 == 200)) else 1


if __name__ == "__main__":
    sys.exit(main())
