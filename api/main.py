"""
api/main.py — FastAPI catalog endpoint (FAZ 6)

GET    /api/catalog              — tüm ürünler
GET    /api/catalog/{id}         — tek ürün
POST   /api/catalog              — yeni ürün
PUT    /api/catalog/{id}         — kısmi güncelleme
DELETE /api/catalog/{id}         — sil

Arama/filtre: GET /api/catalog?q=&type=&surface=

Çalıştır:
    python -m uvicorn api.main:app --reload --port 8000

Vite dev server (port 5173) /api/catalog isteklerini proxy ile bu sunucuya
yönlendirir. CAD endpoint'leri (/api/cad-files, /api/prepare-simulation)
Vite middleware tarafında kalır.
"""
from __future__ import annotations

import os

from typing import Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from . import storage
from .models import (
    CatalogResponse,
    ProductBase,
    ProductCreate,
    ProductUpdate,
)

app = FastAPI(title="Seramikcim Catalog API", version="1.0.0")

origins_env = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [o.strip() for o in origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


def _matches_filter(product: dict, q: Optional[str], type_: Optional[str], surface: Optional[str]) -> bool:
    if q:
        haystack = " ".join(str(v) for v in [
            product.get("name"), product.get("sku"), product.get("color"),
        ] if v).lower()
        if q.lower() not in haystack:
            return False
    if type_ and product.get("type") != type_:
        return False
    if surface and product.get("surface") != surface:
        return False
    return True


@app.get("/api/catalog", response_model=CatalogResponse)
def list_products(
    q: Optional[str] = None,
    type: Optional[str] = None,
    surface: Optional[str] = None,
):
    items = [
        product for product in storage.list_all()
        if _matches_filter(product, q, type, surface)
    ]
    return CatalogResponse(products=items, count=len(items))


@app.get("/api/catalog/{product_id}", response_model=ProductBase)
def get_product(product_id: str):
    item = storage.get(product_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ürün bulunamadı.")
    return item


@app.post("/api/catalog", response_model=ProductBase, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate):
    created = storage.create(payload.model_dump(exclude_none=True))
    return created


@app.put("/api/catalog/{product_id}", response_model=ProductBase)
def update_product(product_id: str, payload: ProductUpdate):
    updated = storage.update(product_id, payload.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ürün bulunamadı.")
    return updated


@app.delete("/api/catalog/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: str):
    ok = storage.delete(product_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ürün bulunamadı.")


@app.get("/api/health")
def health():
    return {"status": "ok", "products": len(storage.list_all())}


from pydantic import BaseModel

class ClientLogPayload(BaseModel):
    level: str
    message: str

@app.post("/api/log", status_code=status.HTTP_204_NO_CONTENT)
def receive_client_log(payload: ClientLogPayload):
    print(f"[CLIENT] [{payload.level}] {payload.message}")

