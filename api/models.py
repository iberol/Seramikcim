"""
api/models.py — Pydantic ürün modelleri

Catalog.json ürün şemasıyla birebir uyumlu:
  - tile (seramik): width_m, height_m, surface, pieces_per_box, sqm_per_box
  - fixture (lavabo/WC/duş): fixtureKind, width_m, depth_m, height_m
  - accessory: fixtureKind, varied dimensions

ProductBase ortak alanları içerir; spesifik tipler ekstra alan opsiyonel.
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    id: str
    type: Literal["tile", "fixture", "accessory"]
    name: str
    sku: Optional[str] = None
    color: Optional[str] = None
    price: Optional[float] = None

    # Tile fields
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    depth_m: Optional[float] = None
    length_m: Optional[float] = None
    surface: Optional[Literal["mat", "saten", "parlak"]] = None
    pieces_per_box: Optional[int] = None
    sqm_per_box: Optional[float] = None

    # Fixture / Accessory fields
    fixtureKind: Optional[str] = None

    model_config = {"extra": "allow"}


class ProductCreate(BaseModel):
    """Yeni ürün oluşturma için (id otomatik üretilir)."""
    type: Literal["tile", "fixture", "accessory"]
    name: str = Field(..., min_length=1)
    sku: Optional[str] = None
    color: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    width_m: Optional[float] = Field(None, gt=0)
    height_m: Optional[float] = Field(None, gt=0)
    depth_m: Optional[float] = Field(None, gt=0)
    length_m: Optional[float] = Field(None, gt=0)
    surface: Optional[Literal["mat", "saten", "parlak"]] = None
    pieces_per_box: Optional[int] = Field(None, gt=0)
    sqm_per_box: Optional[float] = Field(None, gt=0)
    fixtureKind: Optional[str] = None


class ProductUpdate(BaseModel):
    """Kısmi güncelleme: tüm alanlar opsiyonel."""
    name: Optional[str] = None
    sku: Optional[str] = None
    color: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    width_m: Optional[float] = Field(None, gt=0)
    height_m: Optional[float] = Field(None, gt=0)
    depth_m: Optional[float] = Field(None, gt=0)
    length_m: Optional[float] = Field(None, gt=0)
    surface: Optional[Literal["mat", "saten", "parlak"]] = None
    pieces_per_box: Optional[int] = Field(None, gt=0)
    sqm_per_box: Optional[float] = Field(None, gt=0)
    fixtureKind: Optional[str] = None


class CatalogResponse(BaseModel):
    products: list[ProductBase]
    count: int
