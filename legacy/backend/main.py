from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.converters import frontend_to_backend, backend_to_frontend
from backend.treelogic import (
    backward_fill_along_path,
    forward_probability_along_path,
    calculate_ev,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EVRequest(BaseModel):
    tree: dict


class EVResponse(BaseModel):
    tree: dict
    root_ev: float


class BackwardRequest(BaseModel):
    tree: dict
    path: list[str]
    final_probability: float


class BackwardResponse(BaseModel):
    tree: dict
    forward_check: float


@app.post("/ev", response_model=EVResponse)
def run_ev(req: EVRequest):
    root = frontend_to_backend(req.tree)
    root_ev = calculate_ev(root)
    return EVResponse(tree=backend_to_frontend(root), root_ev=root_ev)


@app.post("/backward", response_model=BackwardResponse)
def run_backward(req: BackwardRequest):
    root = frontend_to_backend(req.tree)
    backward_fill_along_path(root, req.path, req.final_probability)
    forward = forward_probability_along_path(root, req.path)
    return BackwardResponse(tree=backend_to_frontend(root), forward_check=forward)
