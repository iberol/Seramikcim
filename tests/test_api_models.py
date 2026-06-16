"""
test_api_models.py — Pydantic model validation testleri
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.models import ProductBase, ProductCreate, ProductUpdate, CatalogResponse


class TestProductBase:
    def test_minimum_geçerli(self):
        p = ProductBase(id="t1", type="tile", name="Test")
        assert p.id == "t1"
        assert p.type == "tile"

    def test_geçersiz_type_red(self):
        with pytest.raises(ValidationError):
            ProductBase(id="t1", type="invalid", name="X")

    def test_extra_alanlar_kabul(self):
        # model_config extra=allow
        p = ProductBase(id="t1", type="tile", name="X", customField="ok")
        assert getattr(p, "customField", None) == "ok"


class TestProductCreate:
    def test_minimum_geçerli(self):
        p = ProductCreate(type="tile", name="Yeni Seramik")
        assert p.name == "Yeni Seramik"
        assert p.id is None if hasattr(p, "id") else True

    def test_name_boş_string_red(self):
        with pytest.raises(ValidationError):
            ProductCreate(type="tile", name="")

    def test_negatif_fiyat_red(self):
        with pytest.raises(ValidationError):
            ProductCreate(type="tile", name="X", price=-1)

    def test_sıfır_width_red(self):
        with pytest.raises(ValidationError):
            ProductCreate(type="tile", name="X", width_m=0)

    def test_geçersiz_surface_red(self):
        with pytest.raises(ValidationError):
            ProductCreate(type="tile", name="X", surface="metalik")


class TestProductUpdate:
    def test_tüm_alanlar_opsiyonel(self):
        p = ProductUpdate()
        assert p.name is None

    def test_kısmi_güncelleme(self):
        p = ProductUpdate(name="Yeni İsim", price=200.5)
        assert p.name == "Yeni İsim"
        assert p.price == 200.5
        assert p.width_m is None


class TestCatalogResponse:
    def test_boş_liste(self):
        r = CatalogResponse(products=[], count=0)
        assert r.count == 0
        assert r.products == []

    def test_ürünlerle(self):
        prod = ProductBase(id="p1", type="tile", name="X")
        r = CatalogResponse(products=[prod], count=1)
        assert r.count == 1
        assert r.products[0].id == "p1"
