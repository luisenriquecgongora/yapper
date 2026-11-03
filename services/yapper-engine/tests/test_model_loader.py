"""Model archive extraction must stay inside the model directory."""

import io
import tarfile

import pytest

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
