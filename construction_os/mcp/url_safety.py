"""URL validation and SSRF protections for MCP endpoints."""

from __future__ import annotations

import ipaddress
from construction_os.utils.env import get_env
import socket
from urllib.parse import urlparse

from construction_os.mcp.limits import ALLOW_PRIVATE_URLS_ENV


class McpUrlError(Exception):
    """Raised when an MCP endpoint URL is rejected."""


def allow_private_urls() -> bool:
    """Return True when private/loopback MCP URLs are explicitly allowed."""
    return (get_env(ALLOW_PRIVATE_URLS_ENV) or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the IP should be blocked under the default SSRF policy."""
    if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
        return True
    if ip.is_private or ip.is_reserved:
        return True
    # Cloud metadata / link-local specials
    if isinstance(ip, ipaddress.IPv4Address):
        if ip in ipaddress.ip_network("169.254.0.0/16"):
            return True
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return _is_blocked_ip(ip.ipv4_mapped)
    return False


def _hostname_resolves_to_blocked(hostname: str) -> bool:
    """Resolve hostname and reject if any address is blocked (unless opted in)."""
    if allow_private_urls():
        return False
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise McpUrlError(f"Unable to resolve MCP host: {hostname}") from exc
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _is_blocked_ip(ip):
            return True
    return False


def validate_mcp_url(url: str) -> str:
    """
    Validate and normalize an MCP Streamable HTTP endpoint URL.

    Rejects non-http(s) schemes, embedded credentials, and (by default)
    private/loopback/link-local/metadata destinations.
    """
    if not url or not isinstance(url, str):
        raise McpUrlError("MCP endpoint URL is required")

    cleaned = url.strip()
    parsed = urlparse(cleaned)

    if parsed.scheme not in {"http", "https"}:
        raise McpUrlError("MCP endpoint must use http or https")

    if parsed.username is not None or parsed.password is not None:
        raise McpUrlError("MCP endpoint must not include embedded credentials")

    if not parsed.hostname:
        raise McpUrlError("MCP endpoint must include a hostname")

    hostname = parsed.hostname
    # Literal IP in the URL vs hostname that needs DNS resolution
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = None

    if ip is not None:
        if not allow_private_urls() and _is_blocked_ip(ip):
            raise McpUrlError(
                "Private or loopback MCP URLs are blocked. "
                f"Set {ALLOW_PRIVATE_URLS_ENV}=true to allow them."
            )
    elif _hostname_resolves_to_blocked(hostname):
        raise McpUrlError(
            "MCP host resolves to a private or loopback address. "
            f"Set {ALLOW_PRIVATE_URLS_ENV}=true to allow them."
        )

    # Rebuild without fragment; keep path/query
    netloc = parsed.hostname
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    normalized = f"{parsed.scheme}://{netloc}{parsed.path or ''}"
    if parsed.query:
        normalized = f"{normalized}?{parsed.query}"
    return normalized
