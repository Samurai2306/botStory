import logging
import uuid
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.request_context import set_request_id

logger = logging.getLogger(__name__)

app = FastAPI(
    title="L.o.B.O.T API",
    description="Educational platform for learning programming",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware (обязательно для запросов с фронта на другом порту)
_cors_origins = getattr(settings, "BACKEND_CORS_ORIGINS", None) or [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id
    set_request_id(request_id)
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.get("/")
async def root():
    return {
        "message": "Algorithmic Robot API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


def _safe_error_payload(request: Request, error_code: str, message: str, detail: str | None = None) -> dict:
    payload = {
        "error_code": error_code,
        "message": message,
        "request_id": getattr(request.state, "request_id", None),
    }
    if detail is not None:
        payload["detail"] = detail
    return payload


@app.exception_handler(FastAPIHTTPException)
async def http_error_handler(request: Request, exc: FastAPIHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    status = exc.status_code
    if status == 401:
        error_code = "AUTH_UNAUTHORIZED"
    elif status == 403:
        error_code = "AUTH_FORBIDDEN"
    elif status == 404:
        error_code = "NOT_FOUND"
    elif status == 429:
        error_code = "RATE_LIMITED"
    elif status < 500:
        error_code = "BAD_REQUEST"
    else:
        error_code = "INTERNAL_ERROR"
    return JSONResponse(
        status_code=status,
        content=_safe_error_payload(request, error_code, detail, detail=detail),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error request_id=%s errors=%s", getattr(request.state, "request_id", None), exc.errors())
    return JSONResponse(
        status_code=422,
        content=_safe_error_payload(request, "VALIDATION_ERROR", "Request validation failed"),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return safe error envelope without internal exception details."""
    logger.exception(
        "Unhandled exception request_id=%s path=%s",
        getattr(request.state, "request_id", None),
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content=_safe_error_payload(request, "INTERNAL_ERROR", "Internal server error"),
    )
