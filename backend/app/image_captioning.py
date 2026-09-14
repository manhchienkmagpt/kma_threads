import logging
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)
_inference_lock = threading.Lock()


class CaptionModelUnavailableError(RuntimeError):
    pass


class CaptionGenerationError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_caption_pipeline():
    try:
        from transformers import pipeline

        return pipeline(
            "image-text-to-text",
            model=settings.florence_model,
        )
    except Exception as exc:
        logger.exception("Could not load Florence caption model")
        raise CaptionModelUnavailableError("Florence caption model is unavailable") from exc


def _generated_text(output: Any) -> str:
    item = output[0] if isinstance(output, list) and output else output
    if isinstance(item, dict):
        item = item.get("generated_text", "")
    if isinstance(item, list) and item:
        item = item[-1]
        if isinstance(item, dict):
            item = item.get("content", item.get("text", ""))
    if isinstance(item, dict):
        item = item.get("content", item.get("text", ""))
    return str(item or "").replace("<CAPTION>", "").strip()


def suggest_image_caption(storage_path: str) -> str:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        raise CaptionModelUnavailableError("Pillow is not installed") from exc

    path = Path(storage_path)
    try:
        with Image.open(path) as source:
            image = source.convert("RGB")
    except (OSError, UnidentifiedImageError) as exc:
        raise CaptionGenerationError("The stored media is not a valid image") from exc

    try:
        with _inference_lock:
            output = get_caption_pipeline()(images=image, text="<CAPTION>")
    except CaptionModelUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Florence caption inference failed")
        raise CaptionGenerationError("Florence could not caption the image") from exc

    caption = _generated_text(output)
    if not caption:
        raise CaptionGenerationError("Florence returned an empty caption")
    return caption[:500]
