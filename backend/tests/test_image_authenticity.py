from io import BytesIO

import pytest
from PIL import Image

from app import image_authenticity
from app.image_authenticity import ImageAuthenticityUnavailableError


def image_bytes() -> bytes:
    content = BytesIO()
    Image.new("RGB", (2, 2), color="white").save(content, format="PNG")
    return content.getvalue()


def test_classify_image_maps_notebook_labels(monkeypatch):
    monkeypatch.setattr(
        image_authenticity,
        "get_classifier",
        lambda: lambda _: (0.92, 0.08),
    )

    result = image_authenticity.classify_image(image_bytes())

    assert result.real_score == pytest.approx(0.08)
    assert result.fake_score == pytest.approx(0.92)
    assert result.is_ai_generated is True


def test_classify_image_wraps_inference_errors(monkeypatch):
    def fail(_):
        raise RuntimeError("inference failed")

    monkeypatch.setattr(image_authenticity, "get_classifier", lambda: fail)

    with pytest.raises(ImageAuthenticityUnavailableError):
        image_authenticity.classify_image(image_bytes())
