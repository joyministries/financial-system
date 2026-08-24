#!/usr/bin/env python3
"""
Seed 100 parent accounts with 1-5 random kids each via the production API.
Uses /auth/register/parent endpoint — safe, no existing data touched.

Usage: python3 seed_parents.py
"""

import random
import string
import requests

API = "https://backend-financial.vercel.app/api/v1"

FIRST_NAMES_M = [
    "Thabo", "Sipho", "Bongani", "Tendai", "Farai", "Kudzai", "Tatenda", "Tapiwa",
    "Memory", "Rudo", "Chiedza", "Nyaradzo", "Tafara", "Misheck", "Joseph", "Peter",
    "James", "John", "David", "Michael", "Brian", "Kevin", "Daniel", "Samuel",
    "Emmanuel", "Moses", "Aaron", "Isaac", "Jacob", "Caleb", "Nathan", "Benjamin",
    "Liam", "Ethan", "Noah", "Mason", "Logan", "Alexander", "Sebastian", "Mateo",
    "Jayden", "Gabriel", "Anthony", "Isaiah", "Lincoln", "Joshua", "Christopher",
    "Andrew", "Theo", "Marco", "Neo", "Lebo", "Khaya", "Sizwe", "Andile",
    "Aphiwe", "Lwazi", "Sibusiso", "Nkosi", "Mandla", "Vusi", "Thando", "Lunga",
]

FIRST_NAMES_F = [
    "Amahle", "Naledi", "Bontle", "Lesedi", "Thandiwe", "Nomvula", "Zanele", "Nompumelelo",
    "Grace", "Mercy", "Joy", "Peace", "Faith", "Hope", "Charity", "Blessing",
    "Sarah", "Rebecca", "Rachel", "Hannah", "Esther", "Ruth", "Naomi", "Deborah",
    "Mary", "Elizabeth", "Martha", "Judith", "Priscilla", "Lydia", "Phoebe", "Joanna",
    "Olivia", "Emma", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia", "Harper",
    "Evelyn", "Abigail", "Emily", "Ella", "Scarlett", "Grace", "Chloe", "Lily",
    "Aisha", "Fatima", "Zainab", "Amina", "Khadija", "Halima", "Nafisa", "Sumaya",
]

LAST_NAMES = [
    "Moyo", "Ndlovu", "Dlamini", "Mokoena", "Khumalo", "Zulu", "Mthembu", "Nkosi",
    "Maseko", "Sithole", "Bongwe", "Mkhize", "Cele", "Gumede", "Buthelezi", "Mncube",
    "Adams", "Allen", "Brown", "Clark", "Davis", "Evans", "Green", "Harris",
    "Jones", "King", "Lewis", "Martin", "Nelson", "Oliver", "Parker", "Robinson",
    "Smith", "Taylor", "Thomas", "Walker", "White", "Williams", "Wilson", "Young",
    "Mahlangu", "Mabaso", "Mamabolo", "Mashaba", "Mathebula", "Mbambo", "Ngwenya", "Sibiya",
]

GRADES = []  # Will be fetched from API


def rand_password(length=12):
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=length))


def register_parent(first_name, last_name, email, password, child_count):
    """Register a parent + their kids in one call."""
    data = {
        "email": email,
        "password": password,
        "first_name": first_name,
        "last_name": last_name,
        "phone": f"+27{random.randint(600000000, 899999999)}",
        "physical_address": f"{random.randint(1, 999)} Main St",
    }

    GRADE_IDS = [
        "b75cd1d1-ecca-451a-840f-2cf0d7a7b43f",  # Grade 1
        "ff3c26c1-6938-451d-a2e6-2e8f17c56f63",  # Grade 2
        "2e14032a-d388-474a-8ec4-f8c2999f36ef",  # Grade 3
        "cab5cd35-e664-42ce-9a1b-77796fd311f5",  # Grade 4
        "527fcc53-2df5-417f-9fb6-2d35680c1648",  # Grade 5
        "f3f12ed3-7751-4e7d-93f3-02be0a9ea29a",  # Grade 6
        "a0b69ee0-84bd-48d8-9612-dcd40d05cd61",  # Grade 7
    ]

    # Register with first child (API expects "student", singular)
    is_boy = random.random() < 0.5
    child_first = random.choice(FIRST_NAMES_M if is_boy else FIRST_NAMES_F)
    child_last = random.choice(LAST_NAMES)
    data["student"] = {
        "first_name": child_first,
        "last_name": child_last,
        "grade_id": random.choice(GRADE_IDS),
        "payment_preference": random.choice(["monthly", "cumulative"]),
    }

    try:
        resp = requests.post(f"{API}/auth/register/parent", json=data, timeout=30)
        if resp.status_code in (200, 201):
            result = resp.json()
            students = result.get("students", [])
            token = result.get("access_token", "")
            print(f"  OK: {first_name} {last_name} <{email}> / {password}  ->  {len(students)} kids")
            return token
        else:
            detail = resp.json().get("detail", resp.text) if resp.text else resp.status_code
            print(f"  FAIL: {first_name} {last_name} <{email}>  ->  {detail}")
            return None
    except Exception as e:
        print(f"  ERROR: {email}  ->  {e}")
        return None


def approve_all_students(token):
    """Approve all pending students for a parent."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{API}/students/?page=1&page_size=50", headers=headers, timeout=15)
    if resp.status_code != 200:
        return
    items = resp.json().get("items", [])
    for s in items:
        if s.get("registration_status") == "pending":
            requests.put(
                f"{API}/students/{s['id']}/approve",
                headers=headers,
                timeout=10,
            )


def main():
    random.seed(42)  # Reproducible

    num_parents = 100
    print(f"Registering {num_parents} parent accounts with random kids...\n")

    # Check existing parent count
    resp = requests.post(f"{API}/auth/login", json={
        "email": "admin@school.com",
        "password": "gBBLPa9pE6DI6gGo5B4",
    }, timeout=10)
    if resp.status_code != 200:
        print("Cannot login as admin. Aborting.")
        return

    admin_token = resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Count existing students
    resp = requests.get(f"{API}/students/?page=1&page_size=1", headers=admin_headers, timeout=10)
    existing = resp.json().get("total", 0)
    print(f"Existing students in DB: {existing}")

    # Register parents
    created = 0
    used_emails = set()

    for i in range(num_parents):
        first = random.choice(FIRST_NAMES_M + FIRST_NAMES_F)
        last = random.choice(LAST_NAMES)
        base_email = f"{first.lower()}.{last.lower()}.{random.randint(100,999)}@school.com"

        # Deduplicate
        while base_email in used_emails:
            base_email = f"{first.lower()}.{last.lower()}.{random.randint(1000,9999)}@school.com"
        used_emails.add(base_email)

        child_count = random.choices([1, 2, 3, 4, 5], weights=[30, 35, 20, 10, 5])[0]
        password = rand_password()

        token = register_parent(first, last, base_email, password, child_count)
        if token:
            created += 1
            # Approve their students
            approve_all_students(token)

    print(f"\nDone. Created {created} parent accounts.")
    print(f"Check admin: {existing} existing + ~{sum(random.choices([1,2,3,4,5], weights=[30,35,20,10,5]) for _ in range(created))} new students")


if __name__ == "__main__":
    main()
