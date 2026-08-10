import logging
from dataclasses import dataclass
from io import BytesIO
from threading import Lock
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_load_lock = Lock()
_inference_lock = Lock()
_classifier: Any | None = None


class InvalidImageError(ValueError):
    pass


class ImageModerationUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class ImageAuthenticityResult:
    fake_score: float
    real_score: float

    @property
    def is_fake(self) -> bool:
        return self.fake_score >= settings.deepfake_threshold


def get_classifier():
    global _classifier
    if _classifier is None:
        with _load_lock:
            if _classifier is None:
                from transformers import pipeline

                _classifier = pipeline(
                    "image-classification",
                    model=settings.deepfake_model,
                    device=settings.deepfake_device,
                )
    return _classifier


def classify_image(content: bytes) -> ImageAuthenticityResult:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        logger.exception("Pillow is unavailable")
        raise ImageModerationUnavailableError("Image decoder is unavailable") from exc

    try:
        with Image.open(BytesIO(content)) as source:
            source.load()
            image = source.convert("RGB")
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise InvalidImageError("The uploaded file is not a valid image") from exc

    try:
        with _inference_lock:
            predictions = get_classifier()(image, top_k=None)
    except Exception as exc:
        logger.exception("Image authenticity model failed")
        raise ImageModerationUnavailableError("Image authenticity model is unavailable") from exc

    scores = {str(item["label"]).casefold(): float(item["score"]) for item in predictions}
    if "fake" not in scores or "real" not in scores:
        logger.error("Unexpected image authenticity labels: %s", sorted(scores))
        raise ImageModerationUnavailableError("Image authenticity model returned invalid labels")
    return ImageAuthenticityResult(fake_score=scores["fake"], real_score=scores["real"])
