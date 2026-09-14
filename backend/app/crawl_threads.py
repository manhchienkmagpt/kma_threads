"""Create the local seed snapshot from public Threads profiles.

The Threads website rate-limits ordinary server IPs, so the crawler uses the
public Jina Reader endpoint to obtain the server-rendered profile page.  The
result is stored as a local, reproducible snapshot; ``app.seed`` never needs
network access.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageOps

PROFILE_HANDLES = (
    "zuck",
    "mosseri",
    "meta",
    "threads",
    "instagram",
    "google",
    "microsoft",
    "github",
    "nasa",
    "natgeo",
)
POSTS_PER_PROFILE = 4
THREADS_BASE_URL = "http://www.threads.com"
DEFAULT_READER_BASE_URL = "https://r.jina.ai/http://www.threads.com"
DEFAULT_OUTPUT = Path(__file__).with_name("seed_data") / "threads_seed.json"
MAX_MEDIA_PER_POST = 4
MAX_IMAGE_BYTES = 25 * 1024 * 1024

PROFILE_MARKER_TEMPLATE = (
    r"\[!\[Image \d+: {handle}'s profile picture\]\((?P<avatar>https://[^)]+)\)\]"
    r"\(https?://www\.threads\.com/@{handle}\)"
)
IMAGE_RE = re.compile(r"!\[Image \d+(?::[^]]*)?\]\((https://[^)]+)\)")
POST_URL_RE = re.compile(r"https?://www\.threads\.com/@[A-Za-z0-9._]+/post/[A-Za-z0-9_-]+")
DATE_LINK_RE = re.compile(
    r"\[(\d{1,2}/\d{1,2}/\d{2,4})\]\((https?://www\.threads\.com/@[^)]+/post/[^)]+)\)"
)
MARKDOWN_LINK_RE = re.compile(r"\[([^]]+)\]\([^)]+\)")
COUNT_RE = re.compile(r"^\d+(?:[.,]\d+)?[KMB]?$", re.IGNORECASE)


def _clean_url(value: str) -> str:
    return re.sub(r"\s+", "", html.unescape(value))


def _truncate(value: str, limit: int = 500) -> str:
    if len(value) <= limit:
        return value
    shortened = value[: limit - 1].rsplit(" ", 1)[0].rstrip(".,;: ")
    return (shortened or value[: limit - 1]).rstrip() + "…"


def _parse_timestamp(block: str, position: int) -> tuple[str, str | None]:
    match = DATE_LINK_RE.search(block)
    if match:
        raw_date, source_url = match.groups()
        for fmt in ("%m/%d/%y", "%m/%d/%Y"):
            try:
                parsed = datetime.strptime(raw_date, fmt).replace(tzinfo=UTC)
                return parsed.isoformat(), source_url
            except ValueError:
                pass
    source_match = POST_URL_RE.search(block)
    fallback = datetime.now(UTC) - timedelta(hours=position)
    return fallback.isoformat(), source_match.group(0) if source_match else None


def _post_text(block: str, handle: str) -> str:
    value = IMAGE_RE.sub("", block)
    value = DATE_LINK_RE.sub("", value)
    value = re.sub(
        rf"\[{re.escape(handle)}\]\(https?://www\.threads\.com/@{re.escape(handle)}\)",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = MARKDOWN_LINK_RE.sub(lambda match: match.group(1), value)

    lines: list[str] = []
    for raw_line in value.splitlines():
        line = html.unescape(raw_line.strip())
        if (
            not line
            or COUNT_RE.fullmatch(line)
            or re.fullmatch(r"\d+[smhdw]", line, re.IGNORECASE)
            or re.fullmatch(r"\+\s*\d+", line)
            or line == "Pinned"
        ):
            continue
        lowered = line.lower()
        if lowered.startswith("log in to see more from") or lowered in {
            "log in",
            "come see what everyone’s talking about 💬",
            "come see what everyone's talking about 💬",
        }:
            break
        if line.startswith("[") and "threads.com/" in line:
            continue
        lines.append(line)
    value = "\n".join(lines).strip()
    value = re.sub(r"(?<=\w)\n(?=@)", " ", value)
    value = re.sub(r"\n(?=[,.;:!?])", "", value)
    return _truncate(value)


def _profile_bio(markdown: str, header_avatar: re.Match | None, first_post: re.Match) -> str:
    if header_avatar is None:
        return ""
    header = markdown[header_avatar.end() : first_post.start()]
    ignored = {"follow", "mention", "threads", "replies", "media", "reposts", "pinned"}
    bio_lines = []
    for raw_line in header.splitlines():
        line = html.unescape(raw_line.strip()).strip("# ")
        if not line or re.fullmatch(r"\+\s*\d+", line):
            continue
        link_match = MARKDOWN_LINK_RE.fullmatch(line)
        if link_match:
            label = link_match.group(1).strip()
            if "follower" in label.lower() or label.lower() in ignored:
                continue
            # Standalone links in this area are profile websites, not the bio.
            continue
        if line.lower() in ignored or " follower" in line.lower():
            continue
        bio_lines.append(line)
        if len(bio_lines) == 2:
            break
    return _truncate(" ".join(bio_lines), 500)


def parse_profile(markdown: str, handle: str) -> dict:
    title_match = re.search(rf"^Title: (.*?) \(@{re.escape(handle)}\)", markdown, re.MULTILINE)
    name = html.unescape(title_match.group(1).strip()) if title_match else handle

    header_avatar = re.search(
        rf"!\[Image \d+: {re.escape(handle)}'s profile picture\]\((https://[^)]+)\)",
        markdown,
    )
    marker = re.compile(PROFILE_MARKER_TEMPLATE.format(handle=re.escape(handle)))
    matches = list(marker.finditer(markdown))
    if len(matches) < POSTS_PER_PROFILE:
        raise ValueError(f"@{handle}: expected at least {POSTS_PER_PROFILE} posts, got {len(matches)}")

    posts = []
    for position, match in enumerate(matches):
        end = matches[position + 1].start() if position + 1 < len(matches) else len(markdown)
        block = markdown[match.end() : end]
        media_urls = [_clean_url(url) for url in IMAGE_RE.findall(block)][:MAX_MEDIA_PER_POST]
        timestamp, source_url = _parse_timestamp(block, position)
        text = _post_text(block, handle)
        if not text and not media_urls:
            continue
        posts.append(
            {
                "text": text,
                "timestamp": timestamp,
                "source_url": source_url or f"https://www.threads.com/@{handle}",
                "media_urls": media_urls,
            }
        )
        if len(posts) == POSTS_PER_PROFILE:
            break

    if len(posts) != POSTS_PER_PROFILE:
        raise ValueError(f"@{handle}: could only parse {len(posts)} usable posts")

    return {
        "username": handle,
        "display_name": name,
        "bio": _profile_bio(markdown, header_avatar, matches[0])
        or f"Public Threads profile mirrored from @{handle} for demo data.",
        "avatar_url": _clean_url(header_avatar.group(1)) if header_avatar else None,
        "profile_url": f"https://www.threads.com/@{handle}",
        "posts": posts,
    }


def fetch_profile(client: httpx.Client, reader_base_url: str, handle: str) -> str:
    response = client.get(f"{reader_base_url.rstrip('/')}/@{handle}")
    response.raise_for_status()
    return response.text


def _extension(content_type: str, url: str) -> str:
    content_type = content_type.split(";", 1)[0].lower()
    if content_type in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        return ".webp"
    suffix = Path(urlparse(url).path).suffix.lower()
    return ".webp" if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"} else ".webp"


def download_image(client: httpx.Client, url: str, destination: Path) -> tuple[str, int]:
    response = client.get(url)
    response.raise_for_status()
    if len(response.content) > MAX_IMAGE_BYTES:
        raise ValueError(f"image exceeds {MAX_IMAGE_BYTES} bytes")
    if not response.headers.get("content-type", "").lower().startswith("image/"):
        raise ValueError("URL did not return an image")

    with Image.open(BytesIO(response.content)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGB")
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=82, method=6)
    return "image/webp", destination.stat().st_size


def build_snapshot(
    source_dir: Path | None,
    output: Path,
    reader_base_url: str = DEFAULT_READER_BASE_URL,
) -> dict:
    media_dir = output.parent / "media"
    output.parent.mkdir(parents=True, exist_ok=True)
    profiles = []

    headers = {"User-Agent": "KMA-Threads-seed-crawler/1.0"}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=60) as client:
        for handle in PROFILE_HANDLES:
            if source_dir:
                markdown = (source_dir / f".tmp_{handle}.md").read_text(encoding="utf-8")
            else:
                markdown = fetch_profile(client, reader_base_url, handle)
            profile = parse_profile(markdown, handle)

            avatar_url = profile.pop("avatar_url")
            if avatar_url:
                avatar_name = f"{handle}-avatar.webp"
                try:
                    download_image(client, avatar_url, media_dir / avatar_name)
                    profile["avatar_file"] = avatar_name
                except (httpx.HTTPError, OSError, ValueError) as exc:
                    print(f"Warning: could not download @{handle} avatar: {exc}")
                    profile["avatar_file"] = None

            for post_index, post in enumerate(profile["posts"], start=1):
                local_media = []
                for media_index, media_url in enumerate(post.pop("media_urls"), start=1):
                    media_name = f"{handle}-{post_index}-{media_index}{_extension('', media_url)}"
                    try:
                        mime_type, size_bytes = download_image(
                            client, media_url, media_dir / media_name
                        )
                    except (httpx.HTTPError, OSError, ValueError) as exc:
                        print(f"Warning: could not download {media_url}: {exc}")
                        continue
                    local_media.append(
                        {"file": media_name, "mime_type": mime_type, "size_bytes": size_bytes}
                    )
                post["media"] = local_media
            profiles.append(profile)

    snapshot = {
        "source": "Public profiles on https://www.threads.com",
        "crawled_at": datetime.now(UTC).isoformat(),
        "posts_per_user": POSTS_PER_PROFILE,
        "profiles": profiles,
    }
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Read previously downloaded .tmp_<handle>.md files instead of making Reader requests.",
    )
    parser.add_argument("--reader-base-url", default=DEFAULT_READER_BASE_URL)
    args = parser.parse_args()
    snapshot = build_snapshot(args.source_dir, args.output, args.reader_base_url)
    post_count = sum(len(profile["posts"]) for profile in snapshot["profiles"])
    media_count = sum(
        len(post["media"])
        for profile in snapshot["profiles"]
        for post in profile["posts"]
    )
    print(f"Wrote {len(snapshot['profiles'])} profiles, {post_count} posts and {media_count} media files")


if __name__ == "__main__":
    main()
