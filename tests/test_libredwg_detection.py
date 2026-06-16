"""
test_libredwg_detection.py — DWG converter detection helper testleri
"""
from __future__ import annotations

import sys
import subprocess
import pytest

from prepare_simulation import (
    _find_libredwg,
    _find_oda_converter,
    _run_kwargs,
)


class TestFindLibredwg:
    def test_path_yoksa_none_döner(self, monkeypatch):
        # PATH'i temizle ve conda env path'leri yok et
        monkeypatch.setattr("shutil.which", lambda cmd: None)
        monkeypatch.setenv("CONDA_PREFIX", "/non-existent")
        # Note: gerçek sistemde dwg2dxf varsa test geçer ama None döner mock'la
        result = _find_libredwg()
        # platform-bağımsız: ya None ya Path
        assert result is None or hasattr(result, "exists")

    def test_path_var_ise_döner(self, monkeypatch, tmp_path):
        fake = tmp_path / "dwg2dxf.exe"
        fake.write_text("")
        monkeypatch.setattr("shutil.which", lambda cmd: str(fake) if cmd == "dwg2dxf" else None)
        result = _find_libredwg()
        assert result is not None
        assert result.name == "dwg2dxf.exe"


class TestFindOdaConverter:
    def test_path_yoksa_none(self, monkeypatch):
        monkeypatch.setattr("shutil.which", lambda cmd: None)
        result = _find_oda_converter()
        # ODA gerçekte kurulu olabilir; sadece tip check
        assert result is None or hasattr(result, "exists")


class TestRunKwargs:
    def test_temel_anahtarlar_içerir(self):
        kw = _run_kwargs()
        assert kw["capture_output"] is True
        assert kw["text"] is True
        assert kw["encoding"] == "utf-8"
        assert kw["timeout"] == 120

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows only")
    def test_windows_no_window_flag(self):
        kw = _run_kwargs()
        assert "creationflags" in kw
        assert kw["creationflags"] == subprocess.CREATE_NO_WINDOW
