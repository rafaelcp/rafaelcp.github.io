const containerQuery = '#tarefa';
const chatQuery = '[data-region="popover-region-messages"], .popover-region, .block_online_users, .drawer, .usermenu-container, #usernavigation';

const style = document.createElement('style');
style.innerText = `
  ${containerQuery} { overflow-y: scroll; height: 300px; background: #EEE; }
  ${chatQuery} { display: none !important; }
`;
(document.head || document.documentElement).appendChild(style);

/**
 * Área de transferência interna da aplicação.
 */
let internalClipboard = "";

/**
 * Retorna a instância ativa do Ace Editor, se houver.
 */
function getAceInstance() {
  const el = document.activeElement;
  const container = el ? el.closest('.ace_editor') : null;
  return container ? (container.env?.editor || container.editor || window.ace?.edit(container)) : null;
}

/**
 * Retorna o texto selecionado (seja do Ace Editor ou do HTML da página).
 */
function getSelectedText() {
  const editor = getAceInstance();
  if (editor) return editor.getCopyText();
  return window.getSelection().toString();
}

/**
 * Cancela o evento nativo e esvazia os dados enviados ao sistema operacional.
 */
function blockNative(e) {
  e.preventDefault();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  if (e.clipboardData) e.clipboardData.setData('text/plain', '');
}

/**
 * Manipulador de Cópia.
 */
function handleCopy(e) {
  blockNative(e);
  const text = getSelectedText();
  if (text) internalClipboard = text;
}

/**
 * Manipulador de Recorte.
 */
function handleCut(e) {
  blockNative(e);
  const editor = getAceInstance();
  if (editor) {
    const text = editor.getCopyText();
    if (text) {
      internalClipboard = text;
      editor.remove(editor.getSelectionRange());
    }
  } else {
    const text = window.getSelection().toString();
    if (text) {
      internalClipboard = text;
      window.getSelection().deleteFromDocument();
    }
  }
}

/**
 * Manipulador de Colagem.
 */
function handlePaste(e) {
  blockNative(e);
  if (!internalClipboard) return;

  const editor = getAceInstance();
  if (editor) {
    editor.insert(internalClipboard);
  } else {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.substring(0, start) + internalClipboard + el.value.substring(end);
      el.selectionStart = el.selectionEnd = start + internalClipboard.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

/**
 * Inicialização e registro dos ouvintes.
 */
function initScript() {
  console.log("Script de restrição e clipboard interno inicializado.");

  // Bloqueia menu de contexto
  document.addEventListener("contextmenu", e => e.preventDefault(), true);

  // Bloqueia atalhos de desenvolvedor, salvar e visualização de código
  document.addEventListener("keydown", e => {
    const isMac = navigator.platform.match("Mac");
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    const code = e.keyCode || e.which;

    // Ctrl+Shift+I/J (DevTools), Ctrl+U (Fonte), Ctrl+S (Salvar), F11/F12
    if ((e.ctrlKey && e.shiftKey && [73, 74].includes(code)) ||
        (e.ctrlKey && code === 85) ||
        (isCtrlOrCmd && code === 83) ||
        [122, 123].includes(code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // Interceptação dos eventos de clipboard
  document.addEventListener("copy", handleCopy, true);
  document.addEventListener("cut", handleCut, true);
  document.addEventListener("paste", handlePaste, true);

  // Bloqueio de Drag & Drop
  document.addEventListener("dragstart", e => {
    const text = getSelectedText();
    if (text) internalClipboard = text;
    e.preventDefault();
  }, true);

  document.addEventListener("drop", e => {
    e.preventDefault();
    handlePaste(e);
  }, true);

  document.addEventListener("dragover", e => e.preventDefault(), true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScript);
} else {
  initScript();
}