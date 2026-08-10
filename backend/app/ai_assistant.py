import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


class AssistantUnavailableError(RuntimeError):
    pass


class AssistantProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class AssistantSource:
    title: str
    url: str


@dataclass(frozen=True)
class AssistantResult:
    content: str
    sources: list[AssistantSource] = field(default_factory=list)


@lru_cache(maxsize=1)
def get_gemini_client():
    if not settings.gemini_api_key or not settings.gemini_api_key.get_secret_value().strip():
        raise AssistantUnavailableError("Gemini API key is not configured")
    try:
        from google import genai
    except ImportError as exc:
        raise AssistantUnavailableError("Google Gen AI SDK is not installed") from exc
    return genai.Client(api_key=settings.gemini_api_key.get_secret_value())


def extract_sources(response: Any) -> list[AssistantSource]:
    sources: list[AssistantSource] = []
    seen: set[str] = set()
    for candidate in getattr(response, "candidates", None) or []:
        metadata = getattr(candidate, "grounding_metadata", None)
        for chunk in getattr(metadata, "grounding_chunks", None) or []:
            web = getattr(chunk, "web", None)
            url = str(getattr(web, "uri", "") or "")
            if not url or url in seen:
                continue
            seen.add(url)
            sources.append(
                AssistantSource(
                    title=str(getattr(web, "title", "") or "Nguồn tham khảo"),
                    url=url,
                )
            )
    return sources


async def generate_response(
    *,
    system_instruction: str,
    prompt: str,
    use_search: bool = False,
    temperature: float = 0.2,
) -> AssistantResult:
    try:
        from google.genai import types
    except ImportError as exc:
        raise AssistantUnavailableError("Google Gen AI SDK is not installed") from exc

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=2048,
        tools=[types.Tool(google_search=types.GoogleSearch())] if use_search else None,
    )
    try:
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=config,
        )
        content = (response.text or "").strip()
    except AssistantUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Gemini request failed")
        raise AssistantProviderError("Gemini request failed") from exc
    if not content:
        raise AssistantProviderError("Gemini returned an empty response")
    return AssistantResult(content=content, sources=extract_sources(response))
