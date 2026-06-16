"""
cad_loader_gui.py — Seramikcim CAD Yükleyici
============================================

DWG/DXF dosyalarını seçip simülasyon verisine dönüştürmek ve
web arayüzünü başlatmak için Tkinter tabanlı masaüstü yardımcısı.

Kullanım:
    python cad_loader_gui.py
    npm run gui
"""

from __future__ import annotations

import os
import queue
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

# ── Uygulama dizini tespiti ───────────────────────────────────────────────────

def _find_app_dir() -> Path:
    """
    PyInstaller ile paketlendiğinde sys.executable dizininden,
    normal çalışmada bu dosyanın bir üst dizininden uygulama kökünü bulur.
    """
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parent.parent  # python/ → proje kökü

    for candidate in [base, *base.parents]:
        if (candidate / "package.json").exists():
            return candidate
    return Path.cwd()


APP_DIR = _find_app_dir()
PREPARE_SCRIPT = next(
    (
        candidate
        for candidate in (
            APP_DIR / "prepare_simulation.py",
            APP_DIR / "python" / "prepare_simulation.py",
        )
        if candidate.exists()
    ),
    APP_DIR / "prepare_simulation.py",
)

SUPPORTED_SUFFIXES = {".dwg", ".dxf", ".obj", ".skp"}
SKIP_PATTERNS      = ("_converted", "_test")

# ── Python ortamı tespiti ─────────────────────────────────────────────────────

def _find_python_with_deps() -> str:
    """
    ezdxf'in kurulu olduğu Python yorumlayıcısını bulur.
    aspose-cad de varsa tercih edilir; yoksa ODA File Converter devreye girer.
    Bulamazsa ilk geçerli Python'u döner.

    Düzeltme: Artık sabit Python 3.10 yolu yerine tüm PATH'teki
    Python kurulumları ve sanal ortamlar taranır.
    """
    candidates: list[str] = []

    if not getattr(sys, "frozen", False):
        candidates.append(sys.executable)

    # PATH'teki tüm python varyantları
    for cmd_name in ("python3", "python", "py"):
        found = shutil.which(cmd_name)
        if found:
            candidates.append(found)

    # Windows tipik konumlar
    if sys.platform == "win32":
        for ver in ("313", "312", "311", "310", "39"):
            win_path = (Path.home() / "AppData" / "Local" / "Programs" /
                        "Python" / f"Python{ver}" / "python.exe")
            if win_path.exists():
                candidates.append(str(win_path))

    # Proje içi sanal ortam
    for venv_dir in (APP_DIR / ".venv", APP_DIR / "venv", APP_DIR / "env"):
        if sys.platform == "win32":
            venv_py = venv_dir / "Scripts" / "python.exe"
        else:
            venv_py = venv_dir / "bin" / "python"
        if venv_py.exists():
            candidates.insert(1, str(venv_py))  # sanal ortam öncelikli

    seen: set[str] = set()
    fallback: str | None = None

    for cmd in candidates:
        if not cmd or cmd in seen:
            continue
        seen.add(cmd)
        try:
            result = subprocess.run(
                [cmd, "-c", "import ezdxf; print('ok')"],
                capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=12,
            )
            if result.returncode == 0:
                if fallback is None:
                    fallback = cmd
                # aspose-cad de varsa ideal seçim (DWG desteği)
                result2 = subprocess.run(
                    [cmd, "-c", "import aspose.cad"],
                    capture_output=True, timeout=12,
                )
                if result2.returncode == 0:
                    return cmd
        except Exception:
            continue

    return fallback or (candidates[0] if candidates else "python")


def _find_latest_cad(directory: Path) -> Path | None:
    candidates = [
        p for p in directory.glob("*")
        if p.suffix.lower() in SUPPORTED_SUFFIXES
        and not any(pat in p.stem.lower() for pat in SKIP_PATTERNS)
    ]
    return max(candidates, key=lambda p: p.stat().st_mtime) if candidates else None


def _find_oda_converter() -> Path | None:
    """ODA File Converter yürütülebilir dosyasını bulur."""
    found = shutil.which("ODAFileConverter")
    if found:
        return Path(found)
    if sys.platform == "win32":
        for base in [
            Path("C:/Program Files/ODA"),
            Path("C:/Program Files (x86)/ODA"),
            Path.home() / "AppData" / "Local" / "ODA",
        ]:
            if base.exists():
                for child in sorted(base.iterdir(), reverse=True):
                    candidate = child / "ODAFileConverter.exe"
                    if candidate.exists():
                        return candidate
    return None


def _find_libredwg() -> Path | None:
    """LibreDWG dwg2dxf CLI aracını bulur: proje tools/ → PATH → conda."""
    exe_name = "dwg2dxf.exe" if sys.platform == "win32" else "dwg2dxf"
    bundled = APP_DIR / "tools" / "libredwg" / exe_name
    if bundled.exists():
        return bundled
    found = shutil.which("dwg2dxf")
    if found:
        return Path(found)
    conda_roots: list[Path] = []
    conda_prefix = os.environ.get("CONDA_PREFIX")
    if conda_prefix:
        conda_roots.append(Path(conda_prefix))
    if sys.platform == "win32":
        bin_sub = Path("Library") / "bin"
        for root_name in ("miniconda3", "miniconda", "anaconda3", "anaconda"):
            for base in [Path.home(), Path("C:/"), Path("C:/ProgramData")]:
                conda_roots.append(base / root_name)
        for root in conda_roots:
            candidate = root / bin_sub / "dwg2dxf.exe"
            if candidate.exists():
                return candidate
            envs_dir = root / "envs"
            if envs_dir.exists():
                for env in sorted(envs_dir.iterdir(), reverse=True):
                    candidate = env / bin_sub / "dwg2dxf.exe"
                    if candidate.exists():
                        return candidate
    else:
        for root in conda_roots:
            candidate = root / "bin" / "dwg2dxf"
            if candidate.exists():
                return candidate
    return None


def _detect_dwg_converter(py_cmd: str) -> str:
    """Kullanılabilir DWG dönüştürücüyü tespit eder ve açıklayan bir metin döner."""
    try:
        r = subprocess.run(
            [py_cmd, "-c", "import aspose.cad"],
            capture_output=True, timeout=10,
        )
        if r.returncode == 0:
            return "aspose-cad"
    except Exception:
        pass
    libredwg = _find_libredwg()
    if libredwg:
        return f"LibreDWG dwg2dxf ({libredwg})"
    oda = _find_oda_converter()
    if oda:
        return f"ODA File Converter ({oda.parent.name})"
    return "yok — sadece DXF desteklenir"

# ── Ana pencere ───────────────────────────────────────────────────────────────

class CadLoaderApp(tk.Tk):
    """Seramikcim CAD Yükleyici ana penceresi."""

    _MSG_SUCCESS = "SUCCESS::"
    _MSG_ERROR   = "ERROR::"
    _MSG_DONE    = "DONE::"
    _MSG_WARN    = "WARN::"
    _LOG_POLL_MS = 120
    _DRAWING_KIND_OPTIONS = {
        "Zemin Planı":           "floor_plan",
        "Duvar Görünüşü / Pafta":"elevation_sheet",
        "Karma":                 "mixed",
    }

    def __init__(self) -> None:
        super().__init__()
        self.title("Seramikcim — CAD Yükleyici")
        self.geometry("820x620")
        self.minsize(700, 520)

        self._selected_file       = tk.StringVar()
        self._selected_paths:       list[Path] = []
        self._drawing_kind_vars:    dict[Path, tk.StringVar] = {}
        self._status               = tk.StringVar(value="Hazır")
        self._log_queue: queue.Queue[str] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._server_proc: subprocess.Popen | None = None

        self._build_ui()
        self._poll_logs()
        self._auto_select_latest()

    # ── UI kurulumu ───────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(4, weight=1)

        # Başlık
        header = ttk.Frame(self, padding=(18, 16, 18, 8))
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        ttk.Label(
            header,
            text="Seramikcim CAD Yükleyici",
            font=("Segoe UI", 16, "bold"),
        ).grid(row=0, column=0, sticky="w")
        ttk.Label(
            header,
            text=(
                "DWG/DXF dosyasını seç, simülasyon JSON verisini üret ve web arayüzünü aç.\n"
                "Desteklenen entity: LWPOLYLINE · POLYLINE · LINE · ARC · CIRCLE · INSERT"
            ),
            foreground="#555",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))

        # Dosya seçici
        file_box = ttk.LabelFrame(self, text="Dosya", padding=14)
        file_box.grid(row=1, column=0, sticky="ew", padx=18, pady=8)
        file_box.columnconfigure(0, weight=1)
        ttk.Entry(file_box, textvariable=self._selected_file).grid(
            row=0, column=0, sticky="ew", padx=(0, 8)
        )
        ttk.Button(file_box, text="Dosyaları Seç",
                   command=self._browse_file).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(file_box, text="En Yeni Dosya",
                   command=self._select_latest).grid(row=0, column=2)

        # İçerik türü
        selection_box = ttk.LabelFrame(self, text="İçerik Türü", padding=14)
        selection_box.grid(row=2, column=0, sticky="ew", padx=18, pady=(0, 8))
        selection_box.columnconfigure(0, weight=1)
        self._selection_rows = ttk.Frame(selection_box)
        self._selection_rows.grid(row=0, column=0, sticky="ew")

        # Eylem çubuğu
        actions = ttk.Frame(self, padding=(18, 4, 18, 8))
        actions.grid(row=3, column=0, sticky="ew")
        actions.columnconfigure(3, weight=1)
        self._prepare_btn = ttk.Button(
            actions, text="Simülasyona Hazırla", command=self._prepare
        )
        self._prepare_btn.grid(row=0, column=0, padx=(0, 8))
        self._dev_btn = ttk.Button(
            actions, text="Arayüzü Başlat", command=self._start_server
        )
        self._dev_btn.grid(row=0, column=1, padx=(0, 8))
        ttk.Button(actions, text="Tarayıcıda Aç",
                   command=self._open_browser).grid(row=0, column=2, padx=(0, 8))
        ttk.Label(
            actions, textvariable=self._status, foreground="#2f6f5f"
        ).grid(row=0, column=3, sticky="e")

        # Günlük alanı
        log_frame = ttk.LabelFrame(self, text="İşlem Günlüğü", padding=10)
        log_frame.grid(row=4, column=0, sticky="nsew", padx=18, pady=(0, 18))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        self._log = tk.Text(log_frame, wrap="word", height=18, state="disabled",
                            font=("Consolas", 9))
        self._log.grid(row=0, column=0, sticky="nsew")
        scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self._log.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self._log.configure(yscrollcommand=scroll.set)

        # Renk etiketleri
        self._log.tag_configure("error", foreground="#cc0000")
        self._log.tag_configure("warn",  foreground="#b85c00")
        self._log.tag_configure("ok",    foreground="#1a7a3c")

    # ── Dosya seçimi ──────────────────────────────────────────────────────────

    def _auto_select_latest(self) -> None:
        py_cmd = _find_python_with_deps()
        converter = _detect_dwg_converter(py_cmd)
        self._log_append(f"DWG dönüştürücü: {converter}")

        latest = _find_latest_cad(APP_DIR)
        if latest:
            self._set_selected_files([latest.resolve()])
            self._log_append(f"En yeni CAD dosyası seçildi: {latest.name}")
        else:
            self._log_append("Klasörde henüz DWG/DXF dosyası bulunamadı.")

    def _set_selected_files(self, paths: list[Path]) -> None:
        self._selected_paths = [Path(p).resolve() for p in paths]
        fresh_kind_vars: dict[Path, tk.StringVar] = {}
        for index, path in enumerate(self._selected_paths):
            existing    = self._drawing_kind_vars.get(path)
            default_lbl = "Zemin Planı" if index == 0 else "Duvar Görünüşü / Pafta"
            fresh_kind_vars[path] = existing or tk.StringVar(value=default_lbl)
        self._drawing_kind_vars = fresh_kind_vars
        self._render_selection_rows()
        if not self._selected_paths:
            self._selected_file.set("")
            return
        if len(self._selected_paths) == 1:
            self._selected_file.set(str(self._selected_paths[0]))
            return
        names = ", ".join(p.name for p in self._selected_paths[:3])
        extra = f" +{len(self._selected_paths) - 3}" if len(self._selected_paths) > 3 else ""
        self._selected_file.set(f"{len(self._selected_paths)} dosya seçildi: {names}{extra}")

    def _render_selection_rows(self) -> None:
        for child in self._selection_rows.winfo_children():
            child.destroy()
        if not self._selected_paths:
            ttk.Label(
                self._selection_rows,
                text="Yüklenen her çizim için içerik türünü seçin.",
            ).grid(row=0, column=0, sticky="w")
            return
        for row, path in enumerate(self._selected_paths):
            ttk.Label(
                self._selection_rows, text=path.name
            ).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
            combo = ttk.Combobox(
                self._selection_rows,
                textvariable=self._drawing_kind_vars[path],
                state="readonly",
                values=list(self._DRAWING_KIND_OPTIONS.keys()),
                width=26,
            )
            combo.grid(row=row, column=1, sticky="w", pady=3)

    def _browse_file(self) -> None:
        paths = filedialog.askopenfilenames(
            title="CAD veya mesh dosyalarını seç",
            initialdir=str(APP_DIR),
            filetypes=[
                ("Tüm desteklenenler", "*.dwg *.dxf *.obj *.skp"),
                ("CAD vektör (DWG/DXF)", "*.dwg *.dxf"),
                ("OBJ mesh", "*.obj"),
                ("SketchUp (manuel OBJ export gerekir)", "*.skp"),
                ("DWG dosyaları", "*.dwg"),
                ("DXF dosyaları", "*.dxf"),
                ("Tüm dosyalar",  "*.*"),
            ],
        )
        if paths:
            resolved = [Path(p).resolve() for p in paths]
            # SKP uyarısı — manuel OBJ export gerekir
            skp_files = [p for p in resolved if p.suffix.lower() == ".skp"]
            if skp_files:
                messagebox.showwarning(
                    "SketchUp dosyası — OBJ export gerekli",
                    "SketchUp .skp dosyaları doğrudan desteklenmiyor.\n\n"
                    "SketchUp Pro: File → Export → 3D Model → "
                    "Wavefront OBJ (*.obj)\n\nSonra OBJ dosyasını yükleyin.",
                )
                resolved = [p for p in resolved if p.suffix.lower() != ".skp"]
                if not resolved:
                    return
            self._set_selected_files(resolved)
            self._log_append(f"Seçilen: {', '.join(p.name for p in resolved)}")

    def _select_latest(self) -> None:
        latest = _find_latest_cad(APP_DIR)
        if not latest:
            messagebox.showwarning("Dosya yok", "Klasörde DWG/DXF dosyası bulunamadı.")
            return
        self._set_selected_files([latest.resolve()])
        self._log_append(f"En yeni dosya seçildi: {latest.name}")

    # ── Hazırlama işlemi ──────────────────────────────────────────────────────

    def _prepare(self) -> None:
        if self._worker and self._worker.is_alive():
            messagebox.showinfo(
                "İşlem sürüyor",
                "Mevcut hazırlama işlemi bitmeden yeni işlem başlatılamaz.",
            )
            return
        if not self._selected_paths:
            messagebox.showerror("Dosya bulunamadı",
                                 "Lütfen en az bir DWG/DXF dosyası seçin.")
            return

        self._prepare_btn.configure(state="disabled")
        self._status.set("İşleniyor…")
        self._log_append(
            f"\n── Başladı: {', '.join(p.name for p in self._selected_paths)} ──"
        )

        kind_args: list[str] = []
        for path in self._selected_paths:
            label = self._drawing_kind_vars.get(
                path, tk.StringVar(value="Zemin Planı")
            ).get()
            kind = self._DRAWING_KIND_OPTIONS.get(label, "floor_plan")
            kind_args.extend(["--drawing-kind", f"{path.name}={kind}"])

        self._worker = threading.Thread(
            target=self._prepare_worker,
            args=(list(self._selected_paths), kind_args),
            daemon=True,
        )
        self._worker.start()

    def _prepare_worker(self, paths: list[Path], kind_args: list[str]) -> None:
        try:
            py_cmd = _find_python_with_deps()
            self._log_queue.put(f"Python yorumlayıcı: {py_cmd}\n")

            env  = {**os.environ, "PYTHONIOENCODING": "utf-8"}
            proc = subprocess.Popen(
                [py_cmd, str(PREPARE_SCRIPT), *kind_args,
                 *[str(p) for p in paths]],
                cwd=str(APP_DIR),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", env=env,
            )
            if proc.stdout:
                for line in proc.stdout:
                    self._log_queue.put(line)
            rc = proc.wait()
            if rc != 0:
                raise RuntimeError(f"İşlem hata kodu ile sonlandı: {rc}")
            self._log_queue.put(f"{self._MSG_SUCCESS}Simülasyon verisi hazırlandı.")
        except Exception as exc:
            self._log_queue.put(f"{self._MSG_ERROR}{exc}")
        finally:
            self._log_queue.put(self._MSG_DONE)

    # ── Web sunucusu ──────────────────────────────────────────────────────────

    def _start_server(self) -> None:
        if self._server_proc and self._server_proc.poll() is None:
            self._log_append("Arayüz zaten çalışıyor: http://127.0.0.1:5173/")
            return
        self._log_append("Vite arayüzü başlatılıyor…")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        self._server_proc = subprocess.Popen(
            [npm_cmd, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
            cwd=str(APP_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace",
        )
        threading.Thread(target=self._pipe_server_output, daemon=True).start()
        self._status.set("Arayüz çalışıyor")

    def _pipe_server_output(self) -> None:
        if self._server_proc and self._server_proc.stdout:
            for line in self._server_proc.stdout:
                self._log_queue.put(line)

    def _open_browser(self) -> None:
        import webbrowser
        webbrowser.open("http://127.0.0.1:5173/")
        self._log_append("Tarayıcı açıldı: http://127.0.0.1:5173/")

    # ── Günlük yönetimi ───────────────────────────────────────────────────────

    def _poll_logs(self) -> None:
        try:
            while True:
                msg = self._log_queue.get_nowait()
                if msg.startswith(self._MSG_SUCCESS):
                    self._status.set("Hazırlandı ✓")
                    self._log_append("✓ " + msg.removeprefix(self._MSG_SUCCESS), tag="ok")
                elif msg.startswith(self._MSG_ERROR):
                    self._status.set("Hata ✗")
                    err = msg.removeprefix(self._MSG_ERROR)
                    self._log_append(f"HATA: {err}", tag="error")
                    messagebox.showerror("İşlem hatası", err)
                elif msg.startswith(self._MSG_WARN):
                    self._log_append(
                        "⚠ " + msg.removeprefix(self._MSG_WARN), tag="warn"
                    )
                elif msg == self._MSG_DONE:
                    self._prepare_btn.configure(state="normal")
                else:
                    # HATA/Uyarı içeren satırları renklendir
                    stripped = msg.rstrip("\n")
                    if "HATA" in stripped or "ERROR" in stripped or "Error" in stripped:
                        self._log_append(stripped, tag="error")
                    elif "Uyarı" in stripped or "WARNING" in stripped or "Warning" in stripped:
                        self._log_append(stripped, tag="warn")
                    else:
                        self._log_append(stripped)
        except queue.Empty:
            pass
        self.after(self._LOG_POLL_MS, self._poll_logs)

    def _log_append(self, text: str, tag: str = "") -> None:
        self._log.configure(state="normal")
        if tag:
            self._log.insert("end", text + "\n", tag)
        else:
            self._log.insert("end", text + "\n")
        self._log.see("end")
        self._log.configure(state="disabled")

    # ── Temizlik ──────────────────────────────────────────────────────────────

    def destroy(self) -> None:
        if self._server_proc and self._server_proc.poll() is None:
            self._server_proc.terminate()
        super().destroy()


if __name__ == "__main__":
    app = CadLoaderApp()
    app.mainloop()
