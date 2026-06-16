"""
test_api_endpoints.py — FastAPI TestClient ile endpoint testleri
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import storage
from api.main import app


@pytest.fixture(autouse=True)
def isolate_catalog(tmp_path, monkeypatch):
    """Her test için fresh catalog.json (3 örnek ürün)."""
    f = tmp_path / "catalog.json"
    sample = {
        "products": [
            {"id": "tile-a", "type": "tile", "name": "Beyaz Mat", "color": "white",
             "surface": "mat", "width_m": 0.3, "height_m": 0.6},
            {"id": "tile-b", "type": "tile", "name": "Gri Parlak", "color": "gray",
             "surface": "parlak", "width_m": 0.2, "height_m": 0.2},
            {"id": "fixture-wc", "type": "fixture", "name": "WC Eco", "fixtureKind": "toilet"},
        ]
    }
    f.write_text(json.dumps(sample), encoding="utf-8")
    monkeypatch.setattr(storage, "CATALOG_PATH", f)
    storage.reload()
    return f


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health_200(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert r.json()["products"] == 3


class TestListProducts:
    def test_tüm_ürünler(self, client):
        r = client.get("/api/catalog")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 3
        assert len(data["products"]) == 3

    def test_q_filtre_isim_içinde(self, client):
        r = client.get("/api/catalog?q=Beyaz")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        assert data["products"][0]["id"] == "tile-a"

    def test_type_filtre(self, client):
        r = client.get("/api/catalog?type=fixture")
        data = r.json()
        assert data["count"] == 1
        assert data["products"][0]["fixtureKind"] == "toilet"

    def test_surface_filtre(self, client):
        r = client.get("/api/catalog?surface=parlak")
        data = r.json()
        assert data["count"] == 1
        assert data["products"][0]["id"] == "tile-b"


class TestGetProduct:
    def test_var_olan_200(self, client):
        r = client.get("/api/catalog/tile-a")
        assert r.status_code == 200
        assert r.json()["id"] == "tile-a"

    def test_var_olmayan_404(self, client):
        r = client.get("/api/catalog/nope")
        assert r.status_code == 404


class TestCreateProduct:
    def test_geçerli_payload_201(self, client):
        r = client.post("/api/catalog", json={
            "type": "tile", "name": "Yeni Test",
            "width_m": 0.4, "height_m": 0.4,
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Yeni Test"
        assert data["id"].startswith("tile-")

    def test_geçersiz_payload_422(self, client):
        r = client.post("/api/catalog", json={"type": "invalid", "name": ""})
        assert r.status_code == 422


class TestUpdateProduct:
    def test_kısmi_güncelleme(self, client):
        r = client.put("/api/catalog/tile-a", json={"price": 250})
        assert r.status_code == 200
        assert r.json()["price"] == 250
        assert r.json()["name"] == "Beyaz Mat"  # korunur

    def test_var_olmayan_404(self, client):
        r = client.put("/api/catalog/nope", json={"price": 10})
        assert r.status_code == 404


class TestDeleteProduct:
    def test_var_olan_204(self, client):
        r = client.delete("/api/catalog/tile-a")
        assert r.status_code == 204
        # silindi mi?
        r2 = client.get("/api/catalog/tile-a")
        assert r2.status_code == 404

    def test_var_olmayan_404(self, client):
        r = client.delete("/api/catalog/nope")
        assert r.status_code == 404
