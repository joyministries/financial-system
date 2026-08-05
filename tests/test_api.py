import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_register_user(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@test.com",
            "password": "testpass123",
            "full_name": "New User",
            "role": "parent",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@test.com"
    assert data["role"] == "parent"
    assert "id" in data


@pytest.mark.asyncio
async def test_login(client: AsyncClient, admin_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrong@test.com", "password": "wrongpass"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_grade(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/grades/",
        json={"name": "Grade 1", "description": "First Grade"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Grade 1"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_list_grades(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/grades/",
        json={"name": "Grade A"},
        headers=auth_headers,
    )
    response = await client.get("/api/v1/grades/")
    assert response.status_code == 200
    assert len(response.json()) >= 1


@pytest.mark.asyncio
async def test_create_fee_structure(client: AsyncClient, auth_headers):
    grade_resp = await client.post(
        "/api/v1/grades/",
        json={"name": "Grade 10"},
        headers=auth_headers,
    )
    grade_id = grade_resp.json()["id"]

    response = await client.post(
        f"/api/v1/grades/{grade_id}/fees",
        json={
            "grade_id": grade_id,
            "academic_year": 2026,
            "category": "tuition",
            "annual_amount": 12000.00,
            "monthly_installment": 1000.00,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "tuition"
    assert data["annual_amount"] == 12000.00


@pytest.mark.asyncio
async def test_create_student(client: AsyncClient, auth_headers):
    grade_resp = await client.post(
        "/api/v1/grades/",
        json={"name": "Grade 5"},
        headers=auth_headers,
    )
    grade_id = grade_resp.json()["id"]

    user_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "parent1@test.com",
            "password": "testpass123",
            "full_name": "Parent One",
            "role": "parent",
        },
        headers=auth_headers,
    )
    parent_id = user_resp.json()["id"]

    response = await client.post(
        "/api/v1/students/",
        json={
            "student_number": "STU-001",
            "first_name": "John",
            "last_name": "Doe",
            "grade_id": grade_id,
            "parent_id": parent_id,
            "enrollment_date": "2026-01-15T00:00:00Z",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["student_number"] == "STU-001"
    assert data["first_name"] == "John"


@pytest.mark.asyncio
async def test_record_payment(client: AsyncClient, auth_headers):
    grade_resp = await client.post(
        "/api/v1/grades/",
        json={"name": "Grade 3"},
        headers=auth_headers,
    )
    grade_id = grade_resp.json()["id"]

    user_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "parent2@test.com",
            "password": "testpass123",
            "full_name": "Parent Two",
            "role": "parent",
        },
        headers=auth_headers,
    )
    parent_id = user_resp.json()["id"]

    student_resp = await client.post(
        "/api/v1/students/",
        json={
            "student_number": "STU-002",
            "first_name": "Jane",
            "last_name": "Doe",
            "grade_id": grade_id,
            "parent_id": parent_id,
            "enrollment_date": "2026-01-15T00:00:00Z",
        },
        headers=auth_headers,
    )
    student_id = student_resp.json()["id"]

    response = await client.post(
        "/api/v1/payments/",
        json={
            "student_id": student_id,
            "amount": 5000.00,
            "payment_method": "bank_transfer",
            "payment_date": "2026-03-01T00:00:00Z",
            "reference_number": "TXN-001",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["amount"] == 5000.00
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_unauthorized_access(client: AsyncClient):
    response = await client.post(
        "/api/v1/grades/",
        json={"name": "Grade X"},
    )
    assert response.status_code in [401, 403]
