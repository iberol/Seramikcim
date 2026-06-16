"""
test_api_storage.py — api/storage.py disk + cache testleri (tmp_path monkeypatch)
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from api import storage


@pytest.fixture(autouse=True)
def isolate_storage(tmp_path, monkeypatch):
    """Her test için fresh storage path + cache."""
    fake_catalog = tmp_path / "catalog.json"
    fake_catalog.write_text(json.dumps({"products": []}), encoding="utf-8")
    monkeypatch.setattr(storage, "CATALOG_PATH", fake_catalog)
    storage.reload()
    return fake_catalog


class TestReadDisk:
    def test_var_olmayan_dosya_boş_dizi(self, monkeypatch, tmp_path):
        monkeypatch.setattr(storage, "CATALOG_PATH", tmp_path / "nope.json")
        storage.reload()
        assert storage._read_disk() == []

    def test_products_key_içeren_obje_okur(self, isolate_storage):
        isolate_storage.write_text(json.dumps({"products": [{"id": "p1"}]}), encoding="utf-8")
        storage.reload()
        assert storage._read_disk() == [{"id": "p1"}]

    def test_düz_array_okur(self, isolate_storage):
        isolate_storage.write_text(json.dumps([{"id": "p1"}, {"id": "p2"}]), encoding="utf-8")
        storage.reload()
        assert len(storage._read_disk()) == 2


class TestCreate:
    def test_yeni_ürün_id_otomatik(self):
        result = storage.create({"type": "tile", "name": "Test"})
        assert "id" in result
        assert result["id"].startswith("tile-")
        assert result["name"] == "Test"

    def test_create_diske_yazar(self, isolate_storage):
        storage.create({"type": "tile", "name": "Test"})
        on_disk = json.loads(isolate_storage.read_text(encoding="utf-8"))
        assert len(on_disk["products"]) == 1


class TestGet:
    def test_var_olmayan_None(self):
        assert storage.get("xxx") is None

    def test_ekledikten_sonra_döner(self):
        storage.create({"type": "tile", "name": "Test", "id": "fixed-id"})
        result = storage.get("fixed-id")
        assert result is not None
        assert result["name"] == "Test"


class TestUpdate:
    def test_var_olmayan_None(self):
        assert storage.update("nope", {"name": "X"}) is None

    def test_kısmi_merge_eder(self):
        storage.create({"type": "tile", "name": "Old", "id": "p1", "price": 100})
        updated = storage.update("p1", {"price": 200})
        assert updated["price"] == 200
        assert updated["name"] == "Old"

    def test_None_değerleri_atlar(self):
        storage.create({"type": "tile", "name": "Old", "id": "p1"})
        updated = storage.update("p1", {"name": None, "price": 150})
        assert updated["name"] == "Old"
        assert updated["price"] == 150


class TestDelete:
    def test_var_olmayan_False(self):
        assert storage.delete("xxx") is False

    def test_silme_True_döner_diskte_kayboldu(self, isolate_storage):
        storage.create({"type": "tile", "name": "X", "id": "p1"})
        assert storage.delete("p1") is True
        assert storage.get("p1") is None
