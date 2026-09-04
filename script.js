(function () {
  'use strict';

  /** Normalizes human-readable text so searches are case- and accent-insensitive. */
  function normalizeText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }

  function filterPublications(publications, query) {
    const normalizedQuery = normalizeText(query.trim());
    return publications.map((publication) => {
      const matches = !normalizedQuery || normalizeText(publication.textContent).includes(normalizedQuery);
      publication.hidden = !matches;
      return matches;
    }).filter(Boolean).length;
  }

  function publicationCountLabel(count, language = 'en') {
    const isPortuguese = language.toLocaleLowerCase().startsWith('pt');
    if (isPortuguese) return `${count} ${count === 1 ? 'publicação' : 'publicações'}`;
    return `${count} ${count === 1 ? 'publication' : 'publications'}`;
  }

  function init() {
    const search = document.querySelector('#publication-search');
    const publications = Array.from(document.querySelectorAll('[data-publication]'));
    const status = document.querySelector('#results-status');
    const emptyState = document.querySelector('.no-results');
    document.querySelector('#current-year').textContent = new Date().getFullYear();

    search.addEventListener('input', () => {
      const count = filterPublications(publications, search.value);
      status.textContent = publicationCountLabel(count, document.documentElement.lang);
      emptyState.hidden = count !== 0;
    });
  }

  if (typeof module !== 'undefined') module.exports = { normalizeText, filterPublications, publicationCountLabel };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
}());
