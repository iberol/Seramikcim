"""
api/storage.py — public/catalog.json okuma/yazma helpers

Başlangıçta bellekte tutar; POST/PUT/DELETE diske geri yazar.
Atomic write: temp dosyaya yaz, sonra rename (kısmi yazıldığında dosya korunur).
"""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(__file__).resolve().parent.parent / "public" / "catalog.json"
_lock = threading.Lock()
_cache: list[dict] | None = None


def _read_disk() -> list[dict]:
    try:
        data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    if isinstance(data, list):
        return data
    return list(data.get("products") or [])


def _write_disk(products: list[dict]) -> None:
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CATALOG_PATH.with_suffix(".json.tmp")
    payload = {"products": products}
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(CATALOG_PATH)


def load() -> list[dict]:
    global _cache
    with _lock:
        if _cache is None:
            _cache = _read_disk()
        return list(_cache)


def list_all() -> list[dict]:
    return load()


def get(product_id: str) -> dict | None:
    for product in load():
        if product.get("id") == product_id:
            return dict(product)
    return None


def create(product: dict[str, Any]) -> dict:
    global _cache
    with _lock:
        items = list(_cache if _cache is not None else _read_disk())
        new_item = dict(product)
        new_item.setdefault("id", f"{product.get('type', 'product')}-{uuid.uuid4().hex[:8]}")
        items.append(new_item)
        _write_disk(items)
        _cache = items
        return dict(new_item)


def update(product_id: str, patch: dict[str, Any]) -> dict | None:
    global _cache
    with _lock:
        items = list(_cache if _cache is not None else _read_disk())
        for index, item in enumerate(items):
            if item.get("id") == product_id:
                merged = {**item, **{k: v for k, v in patch.items() if v is not None}}
                items[index] = merged
                _write_disk(items)
                _cache = items
                return dict(merged)
        return None


def delete(product_id: str) -> bool:
    global _cache
    with _lock:
        items = list(_cache if _cache is not None else _read_disk())
        new_items = [item for item in items if item.get("id") != product_id]
        if len(new_items) == len(items):
            return False
        _write_disk(new_items)
        _cache = new_items
        return True


def reload() -> None:
    """Disk'ten zorla yeniden oku (test/development için)."""
    global _cache
    with _lock:
        _cache = _read_disk()
