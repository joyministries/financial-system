import uuid


def generate_receipt_number() -> str:
    return f"RCP-{uuid.uuid4().hex[:8].upper()}"


def generate_student_number() -> str:
    return f"STU-{uuid.uuid4().hex[:6].upper()}"
