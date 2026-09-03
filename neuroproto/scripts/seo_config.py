"""Canonical page inventory shared by sitemap generation and SEO validation."""
from dataclasses import dataclass

BASE_URL = "https://rafaelcp.github.io/neuroproto/"


@dataclass(frozen=True)
class Page:
    filename: str
    language: str

    @property
    def url(self) -> str:
        return BASE_URL if self.filename == "index.html" else BASE_URL + self.filename


PAGES = (
    Page("index.html", "en"),
    Page("index-pt.html", "pt-BR"),
    Page("index-es.html", "es"),
    Page("index-fr.html", "fr"),
    Page("index-zh.html", "zh-CN"),
    Page("index-jp.html", "ja"),
    Page("index-hi.html", "hi"),
    Page("index-ar.html", "ar"),
)
