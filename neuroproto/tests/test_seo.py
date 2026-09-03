"""Regression tests for local links, metadata, structured data and sitemap."""
import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from seo_config import BASE_URL, PAGES  # noqa: E402


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.json_ld = []
        self._json_buffer = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        self.tags.append((tag, values, self.getpos()))
        if tag == "script" and values.get("type") == "application/ld+json":
            self._json_buffer = []

    def handle_data(self, data):
        if self._json_buffer is not None:
            self._json_buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._json_buffer is not None:
            self.json_ld.append(json.loads("".join(self._json_buffer)))
            self._json_buffer = None


def parse(page):
    parser = DocumentParser()
    parser.feed(page.read_text(encoding="utf-8"))
    return parser


class SeoTests(unittest.TestCase):
    def test_every_page_has_the_complete_language_menu(self):
        expected_links = [page.filename if page.filename != "index.html" else "./" for page in PAGES]
        for page in PAGES:
            path = ROOT / page.filename
            with self.subTest(page=page.filename):
                parser = parse(path)
                menus = [attrs for tag, attrs, _ in parser.tags if tag == "nav" and attrs.get("id") == "translations"]
                self.assertEqual(len(menus), 1, f"{path}: expected exactly one language menu")
                menu_index = next(
                    index
                    for index, (tag, attrs, _) in enumerate(parser.tags)
                    if tag == "nav" and attrs.get("id") == "translations"
                )
                links = [
                    attrs.get("href")
                    for tag, attrs, _ in parser.tags[menu_index + 1 :]
                    if tag == "a"
                ][: len(PAGES)]
                self.assertEqual(links, expected_links, f"{path}: incomplete or incorrectly ordered language menu")

    def test_every_page_has_complete_unique_metadata(self):
        expected_alternates = {page.language: page.url for page in PAGES}
        expected_alternates["x-default"] = BASE_URL
        for page in PAGES:
            with self.subTest(page=page.filename):
                parser = parse(ROOT / page.filename)
                html = [attrs for tag, attrs, _ in parser.tags if tag == "html"]
                self.assertEqual(html[0].get("lang"), page.language)
                self.assertEqual(sum(tag == "title" for tag, _, _ in parser.tags), 1)
                self.assertEqual(sum(tag == "h1" for tag, _, _ in parser.tags), 1)
                links = [attrs for tag, attrs, _ in parser.tags if tag == "link"]
                canonicals = [item.get("href") for item in links if item.get("rel") == "canonical"]
                self.assertEqual(canonicals, [page.url])
                alternates = {item.get("hreflang"): item.get("href") for item in links if item.get("rel") == "alternate"}
                self.assertEqual(alternates, expected_alternates)
                metas = [attrs for tag, attrs, _ in parser.tags if tag == "meta"]
                names = {item.get("name"): item.get("content") for item in metas if item.get("name")}
                properties = {item.get("property"): item.get("content") for item in metas if item.get("property")}
                self.assertTrue(25 <= len(names["description"]) <= 200)
                self.assertEqual(names["twitter:card"], "summary_large_image")
                self.assertEqual(properties["og:url"], page.url)
                self.assertEqual(len(parser.json_ld), 1)
                article = parser.json_ld[0]["@graph"][0]
                self.assertEqual(article["url"], page.url)
                self.assertEqual(article["inLanguage"], page.language)

    def test_local_assets_and_fragments_exist(self):
        for page in PAGES:
            path = ROOT / page.filename
            parser = parse(path)
            ids = {attrs["id"] for _, attrs, _ in parser.tags if "id" in attrs}
            for tag, attrs, position in parser.tags:
                for attribute in ("href", "src", "poster"):
                    target = attrs.get(attribute)
                    if not target or target.startswith(("http:", "https:", "mailto:")):
                        continue
                    if target.startswith("#"):
                        self.assertIn(target[1:], ids, f"{path}:{position[0]} missing fragment {target}")
                    else:
                        resource = path.parent / urlparse(target).path
                        self.assertTrue(resource.exists(), f"{path}:{position[0]} missing {resource}")

    def test_w3c_reported_markup_regressions(self):
        """Guard every issue reported by the W3C HTML validator."""
        void_element_pattern = re.compile(r"<(?:link|meta|img|br)\b[^>]*?\s/>", re.IGNORECASE)
        split_table_pattern = re.compile(r"</tbody>\s*<thead", re.IGNORECASE)
        for page in PAGES:
            path = ROOT / page.filename
            source = path.read_text(encoding="utf-8")
            self.assertIsNone(void_element_pattern.search(source), f"{path}: XHTML-style void element")
            self.assertIsNone(split_table_pattern.search(source), f"{path}: thead appears after tbody")
            for tag, attrs, position in parse(path).tags:
                if tag in {"audio", "video"}:
                    src = attrs.get("src", "")
                    self.assertNotRegex(src, r"\s", f"{path}:{position[0]} whitespace in media URL: {src}")
                if tag == "video":
                    self.assertNotIn("type", attrs, f"{path}:{position[0]} type belongs on source, not video")
                    width = attrs.get("width")
                    if width is not None:
                        self.assertRegex(width, r"^\d+$", f"{path}:{position[0]} invalid video width: {width}")

    def test_images_have_dimensions_and_alt_text(self):
        for page in PAGES:
            path = ROOT / page.filename
            for tag, attrs, position in parse(path).tags:
                if tag == "img":
                    self.assertIn("alt", attrs, f"{path}:{position[0]} image lacks alt")
                    self.assertIn("width", attrs, f"{path}:{position[0]} image lacks width")
                    self.assertIn("height", attrs, f"{path}:{position[0]} image lacks height")

    def test_shared_stylesheet_and_deferred_media(self):
        for page in PAGES:
            path = ROOT / page.filename
            parser = parse(path)
            self.assertFalse(any(tag == "style" for tag, _, _ in parser.tags), f"{path} embeds CSS")
            styles = [attrs.get("href") for tag, attrs, _ in parser.tags if tag == "link" and attrs.get("rel") == "stylesheet"]
            self.assertEqual(styles, ["styles.css"])
            for tag, attrs, position in parser.tags:
                if tag == "audio":
                    self.assertEqual(attrs.get("preload"), "none", f"{path}:{position[0]} audio preload")
                if tag == "video":
                    self.assertEqual(attrs.get("preload"), "metadata", f"{path}:{position[0]} video preload")
                    self.assertTrue(attrs.get("poster"), f"{path}:{position[0]} video poster")

    def test_robots_advertises_sitemap(self):
        robots = (ROOT.parent / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("User-agent: *", robots)
        self.assertIn(f"Sitemap: {BASE_URL}sitemap.xml", robots)

    def test_sitemap_contains_canonicals_and_language_alternates(self):
        tree = ET.parse(ROOT / "sitemap.xml")
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "x": "http://www.w3.org/1999/xhtml"}
        urls = tree.findall("s:url", ns)
        self.assertEqual({url.findtext("s:loc", namespaces=ns) for url in urls}, {page.url for page in PAGES})
        for url in urls:
            self.assertRegex(url.findtext("s:lastmod", namespaces=ns), r"^20\d\d-\d\d-\d\d$")
            self.assertEqual(len(url.findall("x:link", ns)), len(PAGES) + 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
