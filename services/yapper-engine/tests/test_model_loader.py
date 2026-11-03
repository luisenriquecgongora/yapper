"""Model archive download: checksum verification and safe extraction."""

import hashlib
import io
import tarfile
from unittest.mock import patch

import pytest

from src.engine import model_loader
from src.engine.model_loader import safe_extract


def _archive(tmp_path, entries):
    path = tmp_path / "bundle.tar.gz"
    with tarfile.open(path, "w:gz") as tar:
        for info, data in entries:
            tar.addfile(info, io.BytesIO(data) if data is not None else None)
    return path


def _file(name, data=b"weights"):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    return info, data


def test_extracts_regular_files(tmp_path):
    target = tmp_path / "model"
    target.mkdir()
    archive = _archive(tmp_path, [_file("model.bin"), _file("sub/config.json", b"{}")])
    with tarfile.open(archive, "r:gz") as tar:
        safe_extract(tar, target)
    assert (target / "model.bin").read_bytes() == b"weights"
    assert (target / "sub" / "config.json").read_bytes() == b"{}"


@pytest.mark.parametrize("name", ["../escape.bin", "sub/../../escape.bin"])
def test_rejects_path_traversal(tmp_path, name):
    target = tmp_path / "model"
    target.mkdir()
    archive = _archive(tmp_path, [_file(name)])
    with tarfile.open(archive, "r:gz") as tar, pytest.raises(ValueError):
        safe_extract(tar, target)
    assert not (tmp_path / "escape.bin").exists()


def test_rejects_symlinks(tmp_path):
    target = tmp_path / "model"
    target.mkdir()
    link = tarfile.TarInfo("model.bin")
    link.type = tarfile.SYMTYPE
    link.linkname = "/etc/passwd"
    archive = _archive(tmp_path, [(link, None)])
    with tarfile.open(archive, "r:gz") as tar, pytest.raises(ValueError):
        safe_extract(tar, target)
    assert not (target / "model.bin").exists()


class _FakeResponse:
    status_code = 200

    def __init__(self, body):
        self._body = body
        self.headers = {"content-length": str(len(body))}

    def iter_content(self, chunk_size):
        for i in range(0, len(self._body), chunk_size):
            yield self._body[i:i + chunk_size]


def _bundle_bytes(tmp_path):
    return _archive(tmp_path, [_file("model.bin")]).read_bytes()


@pytest.fixture
def cache_dir(tmp_path, monkeypatch):
    cache = tmp_path / "cache"
    monkeypatch.setattr(model_loader, "LOCAL_CACHE_DIR", cache)
    return cache


def test_download_accepts_matching_checksum(tmp_path, cache_dir, monkeypatch):
    body = _bundle_bytes(tmp_path)
    monkeypatch.setitem(model_loader.MODEL_SHA256, "fake", hashlib.sha256(body).hexdigest())
    with patch("requests.Session.get", return_value=_FakeResponse(body)):
        assert model_loader.download_from_r2_cdn("fake") is True
    assert (cache_dir / "fake" / "model.bin").read_bytes() == b"weights"
    assert not (cache_dir / "fake" / "fake.tar.gz").exists()


def test_download_rejects_checksum_mismatch(tmp_path, cache_dir, monkeypatch):
    body = _bundle_bytes(tmp_path)
    monkeypatch.setitem(model_loader.MODEL_SHA256, "fake", "0" * 64)
    with patch("requests.Session.get", return_value=_FakeResponse(body)):
        assert model_loader.download_from_r2_cdn("fake") is False
    assert list((cache_dir / "fake").iterdir()) == []


def test_download_skips_models_without_checksum(cache_dir):
    with patch("requests.Session.get") as get:
        assert model_loader.download_from_r2_cdn("not-published") is False
    get.assert_not_called()


def test_https_session_uses_os_trust_store():
    pytest.importorskip("truststore")
    adapter = model_loader._https_session().get_adapter("https://example.com")
    assert type(adapter).__name__ == "_OSTrustAdapter"
