from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.charges import router as charges_router
from app.api.v1.documents import router as documents_router
from app.api.v1.financial import router as financial_router
from app.api.v1.grades import router as grades_router
from app.api.v1.invoices import router as invoices_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.payfast import router as payfast_router
from app.api.v1.payments import router as payments_router
from app.api.v1.settings import router as settings_router
from app.api.v1.sms import router as sms_router
from app.api.v1.students import router as students_router
from app.api.v1.system import router as system_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(grades_router)
api_router.include_router(students_router)
api_router.include_router(charges_router)
api_router.include_router(payments_router)
api_router.include_router(payfast_router)
api_router.include_router(financial_router)
api_router.include_router(invoices_router)
api_router.include_router(notifications_router)
api_router.include_router(documents_router)
api_router.include_router(settings_router)
api_router.include_router(sms_router)
api_router.include_router(system_router)
