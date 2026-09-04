# Rafael Coimbra Pinto — professional website

Static, bilingual academic portfolio published with GitHub Pages.

## Languages and URLs

- `index.html` is the default English page at `/`.
- `index-pt.html` is the Brazilian Portuguese page at `/index-pt.html`.
- The language switch in the primary navigation links the two versions directly.
- Canonical and `hreflang` metadata tell search engines which localized URL to use; the English root is also the `x-default`.

When changing professional information or publications, update both HTML files so the versions remain equivalent. Publication titles and author names retain their original published form. Shared presentation and behavior belong in `styles.css` and `script.js`; do not duplicate these assets per language.

## Local development

No build step or third-party runtime dependency is required. Serve the repository root with any static HTTP server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/` for English or `http://localhost:8000/index-pt.html` for Portuguese.

## Tests

The test suite uses Node.js's built-in test runner and covers publication completeness, bilingual navigation and SEO metadata, accessible landmarks, accent-insensitive filtering, and localized result labels:

```sh
node --test tests/site.test.js
```
