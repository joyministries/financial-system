# Security Enforcement Rules

Every code change MUST pass these checks before committing. The agent MUST verify each item.

## Pre-Commit Security Checklist

### 1. API Endpoint Authorization
- [ ] Every `@router.get/post/put/delete` handler in `app/api/v1/` MUST have at least one of:
  - `require_role("admin", "finance", ...)` in `Depends()`
  - `verify_student_access(...)` for student-scoped data
  - `get_current_user` for user-scoped data
  - Exception: public endpoints (auth/login, payfast webhooks, public grade lists) must be explicitly documented as public

### 2. BOLA Protection (Object-Level Authorization)
- [ ] Any endpoint with `{student_id}`, `{user_id}`, `{payment_id}`, `{invoice_id}`, `{guardian_id}` in the path MUST verify the requesting user has access to that object
- [ ] Parent users can only access their own children's data — use `verify_student_access()`
- [ ] Admin/finance users must still be authenticated via `require_role()`

### 3. SQL Injection Prevention
- [ ] Use SQLAlchemy ORM queries (`.where()`, `.filter()`) — never raw SQL with f-strings
- [ ] Never use `text()` with user input
- [ ] Use parameterized queries for any raw SQL

### 4. XSS Prevention
- [ ] React JSX escapes values by default — never use `dangerouslySetInnerHTML`
- [ ] Backend: sanitize any user input rendered in HTML/PDF responses

### 5. Secrets & Credentials
- [ ] NEVER commit API keys, passwords, tokens, or secrets
- [ ] Use environment variables for all secrets
- [ ] Check `git diff` for accidentally exposed secrets before pushing

### 6. Input Validation
- [ ] All user input MUST go through Pydantic schemas (`BaseModel`)
- [ ] Validate file uploads (type, size) in upload endpoints
- [ ] Rate-limit public endpoints (auth, registration, password reset)

### 7. CSRF / State-Changing Operations
- [ ] State-changing operations (POST/PUT/DELETE) must require authentication
- [ ] PayFast ITN must verify MD5 signature

### 8. Database Safety
- [ ] Use `selectinload()` / `joinedload()` for relationships — avoid N+1 queries
- [ ] Always `await db.commit()` after writes
- [ ] Use `db.flush()` only when you need the ID before commit

### 9. Error Handling
- [ ] Never expose internal error details to the frontend (stack traces, DB errors)
- [ ] Return generic error messages to users; log details server-side
- [ ] One student/operation failing must not abort batch operations (use try/except per item)

### 10. Frontend Security
- [ ] Never log tokens, passwords, or secrets in console.log
- [ ] Store JWT tokens in httpOnly cookies or secure storage (not localStorage if avoidable)
- [ ] Validate user input on both client AND server side

## Enforcement

When asked to write or review code, the agent MUST:
1. Run the pre-commit checklist above
2. Flag any violations before committing
3. Refuse to commit code that violates these rules
4. Suggest fixes for any security issues found

## Common Patterns

### Student-scoped endpoint (parent access)
```python
@router.get("/statements/{student_id}")
async def list_statements(
    student_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_student_access(student_id, user, db)
    # ... proceed
```

### Admin-only endpoint
```python
@router.post("/generate-all")
async def generate_all(
    user: User = Depends(require_role("admin", "finance")),
    # ...
):
    # ... proceed
```

### Public endpoint (must be documented)
```python
@router.get("/grades/public", response_model=list[GradeResponse])
async def list_grades_public():
    """Public — no auth required. Used by parent registration form."""
    # ... proceed
```
