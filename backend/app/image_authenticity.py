import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_load_lock = Lock()
_inference_lock = Lock()
_classifier: Any | None = None

IMAGE_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class InvalidImageError(ValueError):
    pass


class ImageAuthenticityUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class ImageAuthenticityResult:
    fake_score: float
    real_score: float

    @property
    def is_ai_generated(self) -> bool:
        return self.fake_score >= settings.ai_generated_threshold


class _EfficientNetAuthenticityClassifier:
    def __init__(self, checkpoint_path: str, device_name: str):
        import torch
        from torch import nn
        from torchvision import models, transforms
        from torchvision.transforms import InterpolationMode

        class AIImageDetector(nn.Module):
            def __init__(self, backbone, feature_dim: int, dropout: float = 0.4):
                super().__init__()
                self.backbone = backbone
                self.avgpool = nn.AdaptiveAvgPool2d(1)
                self.classifier = nn.Sequential(
                    nn.Dropout(p=dropout),
                    nn.Linear(feature_dim, 1),
                )

            def forward(self, inputs):
                features = self.backbone(inputs)
                pooled = self.avgpool(features)
                return self.classifier(torch.flatten(pooled, 1))

        path = Path(checkpoint_path).expanduser()
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[2] / path
        path = path.resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Image authenticity checkpoint was not found: {path}")

        self.device = torch.device(device_name)
        efficientnet = models.efficientnet_b0(weights=None)
        model = AIImageDetector(
            backbone=efficientnet.features,
            feature_dim=efficientnet.classifier[1].in_features,
        )
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(checkpoint, dict) or "model_state_dict" not in checkpoint:
            raise ValueError("Image authenticity checkpoint has an invalid format")
        state_dict = checkpoint["model_state_dict"]
        model.load_state_dict(state_dict, strict=True)
        self.model = model.to(self.device).eval()
        self.transform = transforms.Compose(
            [
                transforms.Resize(
                    (IMAGE_SIZE, IMAGE_SIZE),
                    interpolation=InterpolationMode.BILINEAR,
                ),
                transforms.ToTensor(),
                transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ]
        )

    def __call__(self, image) -> tuple[float, float]:
        import torch

        batch = self.transform(image).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            fake_score = torch.sigmoid(self.model(batch)).squeeze().float().cpu().item()
        # The notebook trains its binary target with real=0 and fake=1.
        return fake_score, 1.0 - fake_score


def get_classifier():
    global _classifier
    if _classifier is None:
        with _load_lock:
            if _classifier is None:
                try:
                    _classifier = _EfficientNetAuthenticityClassifier(
                        checkpoint_path=settings.image_model_path,
                        device_name=settings.image_model_device,
                    )
                except Exception as exc:
                    logger.exception("Could not load the image authenticity model")
                    raise ImageAuthenticityUnavailableError(
                        "Image authenticity model is unavailable"
                    ) from exc
    return _classifier


def classify_image(content: bytes) -> ImageAuthenticityResult:
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:
        logger.exception("Pillow is unavailable")
        raise ImageAuthenticityUnavailableError("Image decoder is unavailable") from exc

    try:
        with Image.open(BytesIO(content)) as source:
            source.load()
            image = source.convert("RGB")
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise InvalidImageError("The uploaded file is not a valid image") from exc

    try:
        with _inference_lock:
            fake_score, real_score = get_classifier()(image)
    except ImageAuthenticityUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Image authenticity inference failed")
        raise ImageAuthenticityUnavailableError(
            "Image authenticity model is unavailable"
        ) from exc

    return ImageAuthenticityResult(fake_score=fake_score, real_score=real_score)
