const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeText, filterPublications, publicationCountLabel } = require('../script.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const portugueseHtml = fs.readFileSync(path.join(__dirname, '..', 'index-pt.html'), 'utf8');

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

test('inglês é o idioma principal e as duas versões apontam uma para a outra', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /href="index-pt\.html"[^>]+hreflang="pt-BR"/);
  assert.match(portugueseHtml, /<html lang="pt-BR">/);
  assert.match(portugueseHtml, /href="\/"[^>]+hreflang="en"/);
  for (const page of [html, portugueseHtml]) {
    assert.match(page, /hreflang="x-default" href="https:\/\/rafaelcp\.github\.io\/"/);
    assert.equal((page.match(/data-publication/g) || []).length, 20);
  }
});

test('as duas versões omitem o PDF do Lattes e as métricas acadêmicas', () => {
  for (const page of [html, portugueseHtml]) {
    assert.doesNotMatch(page, /Currículo do Sistema de Currículos Lattes/);
    assert.doesNotMatch(page, /class="metrics"/);
  }
  for (const metric of ['>351<', '>8<', 'h-index']) assert.ok(!html.includes(metric), metric);
  for (const metric of ['>351<', '>8<', 'índice h']) assert.ok(!portugueseHtml.includes(metric), metric);
});

test('o canal de aulas no YouTube aparece na barra de links dos dois idiomas', () => {
  const channelLink = 'href="https://www.youtube.com/SorPinto" rel="me"';
  assert.ok(html.includes(`${channelLink}>Lectures on YouTube ↗</a>`));
  assert.ok(portugueseHtml.includes(`${channelLink}>Aulas no YouTube ↗</a>`));
});

test('a versão principal apresenta em inglês o conteúdo e a interface', () => {
  for (const expected of ['Professor and researcher', 'Explore publications', 'Research output', 'Search publications', 'Back to top']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.doesNotMatch(html, />Publicações</);
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

test('contador de resultados respeita idioma, singular e plural', () => {
  assert.equal(publicationCountLabel(1, 'en'), '1 publication');
  assert.equal(publicationCountLabel(2, 'en-US'), '2 publications');
  assert.equal(publicationCountLabel(1, 'pt-BR'), '1 publicação');
  assert.equal(publicationCountLabel(0, 'pt'), '0 publicações');
});
