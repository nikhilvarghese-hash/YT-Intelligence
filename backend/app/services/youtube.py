"""
YouTube Data API v3 service.
Handles channel lookup, video listing, and comment scraping.
"""
import asyncio
import re
from datetime import datetime
from typing import Optional, AsyncGenerator
import httpx

from ..config import settings


YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

# Tracks quota usage in-memory (resets on restart; production: use DB)
_quota_tracker = {"used": 0, "last_call": None}


def _get_api_key() -> str:
    key = settings.YOUTUBE_API_KEY
    if not key:
        raise ValueError("YouTube API key not configured. Set it in Settings.")
    return key


def _track_quota(cost: int = 1):
    _quota_tracker["used"] += cost
    _quota_tracker["last_call"] = datetime.utcnow()


def get_quota_info() -> dict:
    daily_quota = 10_000
    return {
        "used": _quota_tracker["used"],
        "remaining": max(0, daily_quota - _quota_tracker["used"]),
        "last_call": _quota_tracker["last_call"],
        "daily_limit": daily_quota,
    }


def _parse_channel_input(query: str) -> dict:
    """Parse channel name, URL, or ID from user input."""
    query = query.strip()

    # Channel ID (UCxxxxxxxx)
    if re.match(r'^UC[a-zA-Z0-9_-]{22}$', query):
        return {"type": "id", "value": query}

    # Handle URLs
    url_patterns = [
        r'youtube\.com/channel/(UC[a-zA-Z0-9_-]{22})',
        r'youtube\.com/@([a-zA-Z0-9._-]+)',
        r'youtube\.com/user/([a-zA-Z0-9._-]+)',
        r'youtube\.com/c/([a-zA-Z0-9._-]+)',
    ]
    for pattern in url_patterns:
        m = re.search(pattern, query)
        if m:
            val = m.group(1)
            if val.startswith("UC"):
                return {"type": "id", "value": val}
            return {"type": "handle", "value": val}

    # Plain handle (@creator)
    if query.startswith("@"):
        return {"type": "handle", "value": query[1:]}

    # Fallback: search by name
    return {"type": "search", "value": query}


async def discover_channel(query: str) -> Optional[dict]:
    """Discover a YouTube channel from name, URL, or ID."""
    parsed = _parse_channel_input(query)
    api_key = _get_api_key()

    async with httpx.AsyncClient(timeout=15) as client:
        if parsed["type"] == "id":
            return await _get_channel_by_id(client, api_key, parsed["value"])

        elif parsed["type"] == "handle":
            # Try forUsername first, then search
            result = await _get_channel_by_handle(client, api_key, parsed["value"])
            if result:
                return result
            return await _search_channel(client, api_key, parsed["value"])

        else:  # search
            return await _search_channel(client, api_key, parsed["value"])


async def _get_channel_by_id(client, api_key: str, channel_id: str) -> Optional[dict]:
    _track_quota(1)
    resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
        "key": api_key,
        "id": channel_id,
        "part": "snippet,statistics",
    })
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    if not items:
        return None
    return _parse_channel_item(items[0])


async def _get_channel_by_handle(client, api_key: str, handle: str) -> Optional[dict]:
    _track_quota(1)
    resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
        "key": api_key,
        "forHandle": handle,
        "part": "snippet,statistics",
    })
    if resp.status_code == 200:
        items = resp.json().get("items", [])
        if items:
            return _parse_channel_item(items[0])
    return None


async def _search_channel(client, api_key: str, query: str) -> Optional[dict]:
    _track_quota(100)
    resp = await client.get(f"{YOUTUBE_API_BASE}/search", params={
        "key": api_key,
        "q": query,
        "type": "channel",
        "part": "snippet",
        "maxResults": 1,
    })
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if not items:
        return None
    channel_id = items[0]["id"]["channelId"]
    return await _get_channel_by_id(client, api_key, channel_id)


def _parse_channel_item(item: dict) -> dict:
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    channel_id = item["id"]
    return {
        "channel_id": channel_id,
        "channel_name": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url"),
        "country": snippet.get("country"),
        "subscriber_count": int(stats.get("subscriberCount", 0)),
        "video_count": int(stats.get("videoCount", 0)),
        "channel_url": f"https://youtube.com/channel/{channel_id}",
    }


async def get_channel_videos(channel_id: str, max_videos: int = 25) -> list[dict]:
    """Fetch videos from a channel, newest first."""
    api_key = _get_api_key()
    videos = []

    async with httpx.AsyncClient(timeout=15) as client:
        # Get uploads playlist ID
        _track_quota(1)
        resp = await client.get(f"{YOUTUBE_API_BASE}/channels", params={
            "key": api_key,
            "id": channel_id,
            "part": "contentDetails",
        })
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return []

        uploads_playlist_id = (
            items[0]
            .get("contentDetails", {})
            .get("relatedPlaylists", {})
            .get("uploads")
        )
        if not uploads_playlist_id:
            return []

        # Paginate through playlist
        next_page_token = None
        while len(videos) < max_videos:
            batch_size = min(50, max_videos - len(videos))
            params = {
                "key": api_key,
                "playlistId": uploads_playlist_id,
                "part": "snippet,contentDetails",
                "maxResults": batch_size,
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            _track_quota(1)
            resp = await client.get(f"{YOUTUBE_API_BASE}/playlistItems", params=params)
            resp.raise_for_status()
            data = resp.json()

            video_ids = [
                item["contentDetails"]["videoId"]
                for item in data.get("items", [])
            ]

            if not video_ids:
                break

            # Get video details
            _track_quota(1)
            stats_resp = await client.get(f"{YOUTUBE_API_BASE}/videos", params={
                "key": api_key,
                "id": ",".join(video_ids),
                "part": "snippet,statistics,contentDetails",
            })
            stats_resp.raise_for_status()
            video_items = stats_resp.json().get("items", [])

            for v in video_items:
                snippet = v.get("snippet", {})
                stats = v.get("statistics", {})
                content = v.get("contentDetails", {})
                published = snippet.get("publishedAt")
                videos.append({
                    "video_id": v["id"],
                    "title": snippet.get("title", ""),
                    "description": snippet.get("description", ""),
                    "url": f"https://youtube.com/watch?v={v['id']}",
                    "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url"),
                    "publish_date": datetime.fromisoformat(published.replace("Z", "+00:00")) if published else None,
                    "views": int(stats.get("viewCount", 0)),
                    "likes": int(stats.get("likeCount", 0)),
                    "comment_count": int(stats.get("commentCount", 0)),
                    "duration": content.get("duration"),
                })

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

    return videos[:max_videos]


async def get_video_comments(
    video_id: str,
    max_comments: int = 500,
) -> list[dict]:
    """Fetch top-level comments + replies for a video."""
    api_key = _get_api_key()
    comments = []

    async with httpx.AsyncClient(timeout=30) as client:
        next_page_token = None

        while len(comments) < max_comments:
            params = {
                "key": api_key,
                "videoId": video_id,
                "part": "snippet,replies",
                "maxResults": 100,
                "order": "relevance",
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            try:
                _track_quota(1)
                resp = await client.get(f"{YOUTUBE_API_BASE}/commentThreads", params=params)
                if resp.status_code == 403:
                    # Comments disabled
                    break
                resp.raise_for_status()
            except httpx.HTTPStatusError:
                break

            data = resp.json()

            for thread in data.get("items", []):
                top = thread.get("snippet", {}).get("topLevelComment", {})
                top_snippet = top.get("snippet", {})
                published = top_snippet.get("publishedAt")

                comment = {
                    "comment_id": top.get("id", ""),
                    "author_name": top_snippet.get("authorDisplayName"),
                    "author_channel_id": top_snippet.get("authorChannelId", {}).get("value"),
                    "comment_text": top_snippet.get("textDisplay", ""),
                    "comment_date": datetime.fromisoformat(published.replace("Z", "+00:00")) if published else None,
                    "likes": top_snippet.get("likeCount", 0),
                    "reply_count": thread.get("snippet", {}).get("totalReplyCount", 0),
                    "replies": [],
                }

                # Inline replies (up to 5)
                for reply in thread.get("replies", {}).get("comments", []):
                    r_snippet = reply.get("snippet", {})
                    r_published = r_snippet.get("publishedAt")
                    comment["replies"].append({
                        "reply_id": reply.get("id", ""),
                        "reply_author": r_snippet.get("authorDisplayName"),
                        "reply_author_channel_id": r_snippet.get("authorChannelId", {}).get("value"),
                        "reply_text": r_snippet.get("textDisplay", ""),
                        "reply_date": datetime.fromisoformat(r_published.replace("Z", "+00:00")) if r_published else None,
                        "likes": r_snippet.get("likeCount", 0),
                    })

                comments.append(comment)

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

    return comments[:max_comments]
