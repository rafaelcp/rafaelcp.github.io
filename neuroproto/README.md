# Neuroproto project page

Static, multilingual companion site for **Neuroevolution of Self-Attention Over Proto-Objects**.

## Architecture

The eight HTML documents contain localized scholarly content and share `styles.css`. Search metadata is intentionally rendered in the static HTML so crawlers do not need JavaScript. `scripts/seo_config.py` is the authoritative inventory of canonical URLs and language codes; the sitemap generator and regression tests both consume it.

## Updating the site

1. Edit the relevant localized HTML documents.
2. When adding a language, add it to `PAGES` in `scripts/seo_config.py`, copy the complete alternate-link cluster into every HTML head, and add localized metadata and JSON-LD.
3. Regenerate the sitemap with `python3 neuroproto/scripts/generate_sitemap.py`.
4. Run `python3 -m unittest discover -s neuroproto/tests -v`.

Canonical URLs, Open Graph URLs, Twitter URLs, `hreflang` links and sitemap entries must remain consistent. Descriptions should be concise and localized. Images require useful alternative text and intrinsic dimensions. Videos use metadata-only preload and intentionally omit custom posters, so each browser derives its preview from the corresponding video instead of displaying unrelated artwork. Video structured data must only be added when an accurate, video-specific thumbnail is available.

Every in-text citation link includes a `title` containing the complete rendered text of its corresponding bibliography entry. This provides the reference on hover without requiring JavaScript. When a bibliography entry changes, update every citation that targets it in all localized documents; the regression suite verifies that the decoded attribute and bibliography text remain identical.

## SEO inventory

Every localized page provides a self-referencing canonical, reciprocal language alternates, social cards, Highwire/Google Scholar citation metadata, and schema.org `ScholarlyArticle` structured data. The repository-level `robots.txt` advertises the sitemap. The sitemap deliberately omits speculative `changefreq` and `priority` values.

## HTML validation

Media filenames use URL-safe lowercase slugs without spaces. MIME `type` belongs on a nested `<source>` element rather than `<video>`; because these videos use `src` directly, no redundant type attribute is emitted. Responsive video sizing is handled by CSS instead of percentage values in the integer-only HTML `width` attribute. Tables contain `thead` before `tbody`, and HTML void elements do not use XHTML trailing slashes. Regression tests preserve all of these W3C validation requirements.
