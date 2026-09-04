const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeText, filterPublications } = require('../script.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('a página apresenta todos os 20 trabalhos do perfil acadêmico', () => {
  assert.equal((html.match(/data-publication/g) || []).length, 20);
  assert.match(html, /Neuroevolution of Self-Attention Over Proto-Objects/);
  assert.match(html, /A Neocortex Inspired Hierarchical Spatio-Temporal Pattern Recognition System/);
});

test('Neuroproto aponta para a pasta e oferece PDF e BibTeX locais', () => {
  assert.match(html, /href="neuroproto\/"/);
  assert.match(html, /href="neuroproto\/neuroproto-gecco\.pdf"/);
  assert.match(html, /href="neuroproto\/neuroproto-gecco\.bib"/);
});

test('metadados, landmarks e recursos de acessibilidade estão presentes', () => {
  for (const expected of ['<main id="conteudo">', 'class="skip-link"', 'aria-live="polite"', 'name="description"', 'rel="canonical"']) assert.ok(html.includes(expected), expected);
  assert.equal((html.match(/<h1/g) || []).length, 1);
});

test('normalização ignora caixa e acentos', () => {
  assert.equal(normalizeText('Computação Evolutiva'), 'computacao evolutiva');
});

test('filtro alterna a visibilidade e devolve a quantidade encontrada', () => {
  const items = [{ textContent: 'Redes Neurais', hidden: false }, { textContent: 'Robótica', hidden: false }];
  assert.equal(filterPublications(items, 'robotica'), 1);
  assert.deepEqual(items.map(({ hidden }) => hidden), [true, false]);
  assert.equal(filterPublications(items, ''), 2);
});
