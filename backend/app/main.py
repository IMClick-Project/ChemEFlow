from __future__ import annotations

from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(
    title="ChemEFlow Calculation API",
    version="0.2.0",
    description="Local Python calculation engine for ChemEFlow.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class LinearSystemRequest(BaseModel):
    matrix: list[list[float]] = Field(min_length=1)
    constants: list[float] = Field(min_length=1)

    @field_validator("matrix")
    @classmethod
    def validate_matrix(cls, matrix: list[list[float]]) -> list[list[float]]:
        size = len(matrix)
        if any(len(row) != size for row in matrix):
            raise ValueError("The MVP requires a square n x n matrix.")
        if not all(np.isfinite(value) for row in matrix for value in row):
            raise ValueError("Matrix values must be finite numbers.")
        return matrix

    @field_validator("constants")
    @classmethod
    def validate_constants(cls, constants: list[float]) -> list[float]:
        if not all(np.isfinite(value) for value in constants):
            raise ValueError("Constants must be finite numbers.")
        return constants


class LinearSystemResponse(BaseModel):
    engine: str
    variableCount: int
    rankA: int
    rankAugmented: int
    classification: Literal["unique", "underdetermined", "inconsistent"]
    solution: list[float] | None


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "engine": "Python",
        "version": "0.2.0",
    }


@app.post("/linear-system/analyze", response_model=LinearSystemResponse)
def analyze_linear_system(request: LinearSystemRequest) -> LinearSystemResponse:
    size = len(request.matrix)
    if len(request.constants) != size:
        raise HTTPException(
            status_code=422,
            detail="The constants vector must contain exactly n values.",
        )

    matrix = np.asarray(request.matrix, dtype=float)
    constants = np.asarray(request.constants, dtype=float)
    augmented = np.column_stack((matrix, constants))

    rank_a = int(np.linalg.matrix_rank(matrix))
    rank_augmented = int(np.linalg.matrix_rank(augmented))

    if rank_a < rank_augmented:
        classification: Literal["unique", "underdetermined", "inconsistent"] = (
            "inconsistent"
        )
        solution = None
    elif rank_a < size:
        classification = "underdetermined"
        solution = None
    else:
        classification = "unique"
        try:
            raw_solution = np.linalg.solve(matrix, constants)
            solution = [float(np.round(value, 12)) for value in raw_solution]
        except np.linalg.LinAlgError as error:
            raise HTTPException(
                status_code=422,
                detail="NumPy could not solve the system reliably.",
            ) from error

    return LinearSystemResponse(
        engine="Python",
        variableCount=size,
        rankA=rank_a,
        rankAugmented=rank_augmented,
        classification=classification,
        solution=solution,
    )
