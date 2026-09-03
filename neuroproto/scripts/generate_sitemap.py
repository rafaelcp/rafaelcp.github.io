#!/usr/bin/env python3
"""Generate the multilingual sitemap from the canonical page inventory."""
from pathlib import Path
from xml.etree import ElementTree as ET

from seo_config import PAGES, BASE_URL

ROOT = Path(__file__).resolve().parents[1]
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
XHTML = "http://www.w3.org/1999/xhtml"
ET.register_namespace("", NS)
ET.register_namespace("xhtml", XHTML)


def build_sitemap(last_modified: str) -> ET.ElementTree:
    urlset = ET.Element(f"{{{NS}}}urlset")
    alternates = [(page.language, page.url) for page in PAGES]
    alternates.append(("x-default", BASE_URL))
    for page in PAGES:
        url = ET.SubElement(urlset, f"{{{NS}}}url")
        ET.SubElement(url, f"{{{NS}}}loc").text = page.url
        ET.SubElement(url, f"{{{NS}}}lastmod").text = last_modified
        for language, href in alternates:
            ET.SubElement(url, f"{{{XHTML}}}link", {
                "rel": "alternate", "hreflang": language, "href": href,
            })
    ET.indent(urlset, space="  ")
    return ET.ElementTree(urlset)


def main() -> None:
    # Supply a known content date for reproducible builds; today's date is opt-in.
    last_modified = "2026-09-03"
    tree = build_sitemap(last_modified)
    tree.write(ROOT / "sitemap.xml", encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    main()
