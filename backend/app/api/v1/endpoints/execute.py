from collections import defaultdict, deque
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from app.db.database import get_db
from app.db.models import Level, User
from app.core.deps import get_current_admin, get_current_user
from app.core.config import settings
from kumir.executor import KumirExecutor, ExecutionError
from kumir.loop_detect import kumir_code_contains_loop

router = APIRouter()
_test_endpoint_hits_by_ip: dict[str, deque[float]] = defaultdict(deque)


class ExecuteRequest(BaseModel):
    level_id: int
    code: str


class ExecuteResponse(BaseModel):
    success: bool
    reached_finish: bool
    steps_count: int
    history: List[tuple]
    final_position: Dict[str, Any]
    error: Optional[str] = None
    events: Optional[List[Dict[str, Any]]] = None

    # Comparison with golden standard
    is_optimal: Optional[bool] = None
    golden_steps_count: Optional[int] = None
    mine_history: Optional[List[tuple]] = None
    gates_history: Optional[List[Dict[str, bool]]] = None
    used_loop_constructs: Optional[bool] = None


@router.post("/", response_model=ExecuteResponse)
async def execute_code(
    request: ExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Execute Kumir code for a level"""
    # Get level
    level = db.query(Level).filter(Level.id == request.level_id).first()
    if not level:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Level not found"
        )
    
    try:
        # Create executor and run code
        executor = KumirExecutor(level.map_data)
        result = executor.execute(request.code)
        result["used_loop_constructs"] = kumir_code_contains_loop(request.code)

        # Compare with golden standard
        if result["success"] and result["reached_finish"]:
            result["golden_steps_count"] = level.golden_steps_count
            result["is_optimal"] = result["steps_count"] <= level.golden_steps_count

        return ExecuteResponse(**result)
    
    except ExecutionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.public_message if hasattr(e, "public_message") else "Code execution failed"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Code execution failed"
        )


@router.get("/test")
async def test_executor(
    request: Request,
    _current_user: User = Depends(get_current_admin),
):
    """Test executor with simple map (старт → финиш за 3 шага)"""
    if not settings.ENABLE_TEST_ENDPOINTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    ip = request.client.host if request.client and request.client.host else "unknown"
    now = time.time()
    hits = _test_endpoint_hits_by_ip[ip]
    cutoff = now - 60
    while hits and hits[0] < cutoff:
        hits.popleft()
    if len(hits) >= 20:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many test requests",
            headers={"Retry-After": "60"},
        )
    hits.append(now)

    test_map = {
        "width": 3,
        "height": 3,
        "cells": [
            ["empty", "empty", "empty"],
            ["empty", "start", "empty"],
            ["empty", "finish", "empty"],
        ],
    }

    test_code = """
    направо
    направо
    вперед
    """
    
    try:
        executor = KumirExecutor(test_map)
        result = executor.execute(test_code)
        return result
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Test execution failed")
