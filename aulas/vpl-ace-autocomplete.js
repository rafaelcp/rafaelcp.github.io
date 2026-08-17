/**
 * VPL ACE Editor Complete Enhancer
 * 
 * Uso via tag <script>:
 *   <script src="vpl-ace-autocomplete.js?lang=c"></script>
 *   <script src="vpl-ace-autocomplete.js?lang=python"></script>
 */
(function initVplAceEnhancer() {
    var MAX_ATTEMPTS = 25;
    var attempts = 0;

    function getSelectedLanguage() {
        var src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : "";
        var queryString = src.includes("?") ? src.split("?")[1] : window.location.search.substring(1);
        var params = new URLSearchParams(queryString);
        var lang = params.get("lang") || params.get("mode") || params.get("linguagem");
        return lang ? lang.toLowerCase() : "both";
    }

    var targetLang = getSelectedLanguage();

    function startPolling() {
        var timer = setInterval(function() {
            attempts++;
            var editorEl = document.querySelector('.ace_editor');

            if (window.ace && editorEl) {
                clearInterval(timer);
                setupAce(editorEl);
            } else if (attempts >= MAX_ATTEMPTS) {
                clearInterval(timer);
            }
        }, 200);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startPolling);
    } else {
        startPolling();
    }

    function setupAce(editorEl) {
        var editor = ace.edit(editorEl);

        ensureLanguageTools(function(langTools) {
            applyOptionsAndSnippets(editor, langTools);
            initCustomCompleters(editor, langTools);
        });

        initNativeLinter(editor);
        initHoverTooltips(editor);
        initParameterHints(editor);
        initHeaderAutoImport(editor);
        initAutoTriggerAutocomplete(editor);
        initOccurrenceHighlight(editor);
    }

    function ensureLanguageTools(callback) {
        var langTools = (window.ace && ace.require) ? ace.require("ace/ext/language_tools") : null;
        if (langTools) {
            callback(langTools);
            return;
        }

        if (window.ace && ace.config && typeof ace.config.loadModule === "function") {
            ace.config.loadModule("ace/ext/language_tools", function(module) {
                if (module) {
                    callback(module);
                } else {
                    injectLanguageToolsFallback(callback);
                }
            });
        } else {
            injectLanguageToolsFallback(callback);
        }
    }

    function injectLanguageToolsFallback(callback) {
        var script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.12/ext-language_tools.min.js";
        script.onload = function() {
            var lt = (window.ace && ace.require) ? ace.require("ace/ext/language_tools") : null;
            if (lt) callback(lt);
        };
        script.onerror = function() {
            console.warn("[VPL ACE] Não foi possível carregar ext-language_tools via CDN.");
        };
        document.head.appendChild(script);
    }

    // --- 1. DESTAQUE VISUAL DE TODAS AS OCORRÊNCIAS DO TOKEN ---
    function initOccurrenceHighlight(editor) {
        var session = editor.getSession();
        var Range = (window.ace && ace.require) ? ace.require("ace/range").Range : null;
        if (!Range) return;

        var activeMarkerIds = [];
        var currentTokenVal = "";

        if (!document.getElementById('ace-occurrence-style')) {
            var style = document.createElement('style');
            style.id = 'ace-occurrence-style';
            style.innerHTML = `
                .ace_occurrence_highlight {
                    position: absolute;
                    background-color: rgba(100, 150, 250, 0.3) !important;
                    border: 1px solid rgba(100, 150, 250, 0.6) !important;
                    border-radius: 2px;
                    z-index: 15;
                }
            `;
            document.head.appendChild(style);
        }

        function clearMarkers() {
            activeMarkerIds.forEach(function(id) {
                session.removeMarker(id);
            });
            activeMarkerIds = [];
        }

        function highlightAllOccurrences(row, col) {
            var token = session.getTokenAt(row, col);
            
            if (!token || !token.value || !/^[a-zA-Z_]\w*$/.test(token.value)) {
                clearMarkers();
                currentTokenVal = "";
                return;
            }

            var val = token.value;
            if (val === currentTokenVal && activeMarkerIds.length > 0) return;

            clearMarkers();
            currentTokenVal = val;

            var code = session.getValue();
            var lines = code.split("\n");
            var regex = new RegExp("\\b" + val + "\\b", "g");

            for (var r = 0; r < lines.length; r++) {
                var line = lines[r];
                var match;
                while ((match = regex.exec(line)) !== null) {
                    var range = new Range(r, match.index, r, match.index + val.length);
                    var id = session.addMarker(range, "ace_occurrence_highlight", "text");
                    activeMarkerIds.push(id);
                }
            }
        }

        editor.selection.on("changeCursor", function() {
            var cursor = editor.getCursorPosition();
            highlightAllOccurrences(cursor.row, cursor.column);
        });

        editor.on("mousemove", function(e) {
            var pos = e.getDocumentPosition();
            if (pos) {
                highlightAllOccurrences(pos.row, pos.column);
            }
        });

        editor.on("mouseout", function() {
            clearMarkers();
            currentTokenVal = "";
        });
    }

    // --- 2. FORÇA ABERTURA AUTOMÁTICA DO AUTOCOMPLETE AO DIGITAR ---
    function initAutoTriggerAutocomplete(editor) {
        editor.commands.on("afterExec", function(e) {
            if (e.command && e.command.name === "insertstring") {
                var str = e.args;
                if (/^[a-zA-Z0-9_.\->%]$/.test(str)) {
                    setTimeout(function() {
                        if (!editor.completer || !editor.completer.popup || !editor.completer.popup.isOpen) {
                            editor.execCommand("startAutocomplete");
                        }
                    }, 20);
                }
            }
        });
    }

    // === Mapeamento de Bibliotecas Necessárias (#include / import) ===
    var cHeaderMap = {
        "printf": "stdio.h", "scanf": "stdio.h", "fopen": "stdio.h", "fclose": "stdio.h",
        "fprintf": "stdio.h", "fscanf": "stdio.h", "fgets": "stdio.h", "fputs": "stdio.h",
        "fread": "stdio.h", "fwrite": "stdio.h", "FILE": "stdio.h",
        "malloc": "stdlib.h", "calloc": "stdlib.h", "realloc": "stdlib.h", "free": "stdlib.h", "exit": "stdlib.h", "abs": "stdlib.h",
        "strlen": "string.h", "strcpy": "string.h", "strncpy": "string.h", "strcat": "string.h", "strncat": "string.h",
        "strcmp": "string.h", "strncmp": "string.h", "strchr": "string.h", "strrchr": "string.h", "strstr": "string.h",
        "strtok": "string.h", "memset": "string.h", "memcpy": "string.h", "memmove": "string.h", "memcmp": "string.h",
        "sqrt": "math.h", "pow": "math.h", "ceil": "math.h", "floor": "math.h", "round": "math.h", "fabs": "math.h",
        "sin": "math.h", "cos": "math.h", "tan": "math.h", "log": "math.h", "log10": "math.h", "exp": "math.h", "fmod": "math.h", "hypot": "math.h",
        "isdigit": "ctype.h", "isalpha": "ctype.h", "isalnum": "ctype.h", "isspace": "ctype.h", "toupper": "ctype.h", "tolower": "ctype.h",
        "bool": "stdbool.h", "true": "stdbool.h", "false": "stdbool.h",
        "INT_MAX": "limits.h", "INT_MIN": "limits.h"
    };

    var pyHeaderMap = {
        "sqrt": "math", "ceil": "math", "floor": "math", "fabs": "math", "factorial": "math", "gcd": "math",
        "sin": "math", "cos": "math", "tan": "math", "log": "math", "log10": "math", "exp": "math", "isclose": "math", "pi": "math", "e": "math",
        "randint": "random", "choice": "random", "shuffle": "random", "random": "random", "uniform": "random",
        "argv": "sys", "stdin": "sys", "stdout": "sys"
    };

    // === BASE DE DADOS ESTRUTURADA DE ASSINATURAS (SIGNATURE HELP SIMÉTRICO) ===
    var signatureHelpDB = {
        // C - Entrada/Saída e Arquivos
        "printf": { sig: "printf(format, ...)", params: ["format", "..."] },
        "scanf": { sig: "scanf(format, &var1, ...)", params: ["format", "&var1, ..."] },
        "gets": { sig: "gets(str)", params: ["str"] },
        "fopen": { sig: "fopen(filename, mode)", params: ["filename", "mode"] },
        "fclose": { sig: "fclose(stream)", params: ["stream"] },
        "fprintf": { sig: "fprintf(stream, format, ...)", params: ["stream", "format", "..."] },
        "fscanf": { sig: "fscanf(stream, format, ...)", params: ["stream", "format", "..."] },
        "fgets": { sig: "fgets(str, n, stream)", params: ["str", "n", "stream"] },
        "fputs": { sig: "fputs(str, stream)", params: ["str", "stream"] },
        "fread": { sig: "fread(ptr, size, nmemb, stream)", params: ["ptr", "size", "nmemb", "stream"] },
        "fwrite": { sig: "fwrite(ptr, size, nmemb, stream)", params: ["ptr", "size", "nmemb", "stream"] },

        // C - Memória e Alocação
        "malloc": { sig: "malloc(size)", params: ["size"] },
        "calloc": { sig: "calloc(num, size)", params: ["num", "size"] },
        "realloc": { sig: "realloc(ptr, new_size)", params: ["ptr", "new_size"] },
        "free": { sig: "free(ptr)", params: ["ptr"] },
        "exit": { sig: "exit(status)", params: ["status"] },

        // C - Strings e Memória
        "strcpy": { sig: "strcpy(dest, src)", params: ["dest", "src"] },
        "strncpy": { sig: "strncpy(dest, src, n)", params: ["dest", "src", "n"] },
        "strcat": { sig: "strcat(dest, src)", params: ["dest", "src"] },
        "strncat": { sig: "strncat(dest, src, n)", params: ["dest", "src", "n"] },
        "strcmp": { sig: "strcmp(s1, s2)", params: ["s1", "s2"] },
        "strncmp": { sig: "strncmp(s1, s2, n)", params: ["s1", "s2", "n"] },
        "strlen": { sig: "strlen(str)", params: ["str"] },
        "strchr": { sig: "strchr(str, c)", params: ["str", "c"] },
        "strrchr": { sig: "strrchr(str, c)", params: ["str", "c"] },
        "strstr": { sig: "strstr(haystack, needle)", params: ["haystack", "needle"] },
        "strtok": { sig: "strtok(str, delim)", params: ["str", "delim"] },
        "memset": { sig: "memset(ptr, value, num)", params: ["ptr", "value", "num"] },
        "memcpy": { sig: "memcpy(dest, src, num)", params: ["dest", "src", "num"] },
        "memmove": { sig: "memmove(dest, src, num)", params: ["dest", "src", "num"] },
        "memcmp": { sig: "memcmp(ptr1, ptr2, num)", params: ["ptr1", "ptr2", "num"] },

        // C - Caracteres (ctype.h)
        "isdigit": { sig: "isdigit(c)", params: ["c"] },
        "isalpha": { sig: "isalpha(c)", params: ["c"] },
        "toupper": { sig: "toupper(c)", params: ["c"] },
        "tolower": { sig: "tolower(c)", params: ["c"] },

        // C e Python - Matemática
        "sqrt": { sig: "sqrt(x)", params: ["x"] },
        "pow": { sig: "pow(base, exp)", params: ["base", "exp"] },
        "ceil": { sig: "ceil(x)", params: ["x"] },
        "floor": { sig: "floor(x)", params: ["x"] },
        "round": { sig: "round(number, ndigits=None)", params: ["number", "ndigits=None"] },
        "abs": { sig: "abs(x)", params: ["x"] },
        "fabs": { sig: "fabs(x)", params: ["x"] },
        "sin": { sig: "sin(x)", params: ["x"] },
        "cos": { sig: "cos(x)", params: ["x"] },
        "tan": { sig: "tan(x)", params: ["x"] },
        "log": { sig: "log(x[, base])", params: ["x", "base"] },
        "log10": { sig: "log10(x)", params: ["x"] },
        "exp": { sig: "exp(x)", params: ["x"] },
        "fmod": { sig: "fmod(x, y)", params: ["x", "y"] },
        "hypot": { sig: "hypot(x, y)", params: ["x", "y"] },

        // Python - Built-ins
        "print": { sig: "print(*objects, sep=' ', end='\\n')", params: ["*objects", "sep=' '", "end='\\n'"] },
        "len": { sig: "len(s)", params: ["s"] },
        "range": { sig: "range(start, stop[, step])", params: ["start", "stop", "step"] },
        "open": { sig: "open(file, mode='r')", params: ["file", "mode='r'"] },
        "input": { sig: "input(prompt='')", params: ["prompt=''"] },
        "type": { sig: "type(object)", params: ["object"] },
        "map": { sig: "map(function, iterable)", params: ["function", "iterable"] },
        "filter": { sig: "filter(function, iterable)", params: ["function", "iterable"] },
        "reversed": { sig: "reversed(seq)", params: ["seq"] },
        "sorted": { sig: "sorted(iterable, key=None, reverse=False)", params: ["iterable", "key=None", "reverse=False"] },
        "int": { sig: "int(x=0, base=10)", params: ["x=0", "base=10"] },
        "float": { sig: "float(x=0.0)", params: ["x=0.0"] },
        "str": { sig: "str(object='')", params: ["object=''"] },
        "zip": { sig: "zip(*iterables)", params: ["*iterables"] },
        "enumerate": { sig: "enumerate(iterable, start=0)", params: ["iterable", "start=0"] },
        "list": { sig: "list(iterable=())", params: ["iterable=()"] },
        "tuple": { sig: "tuple(iterable=())", params: ["iterable=()"] },
        "min": { sig: "min(iterable, key=None)", params: ["iterable", "key=None"] },
        "max": { sig: "max(iterable, key=None)", params: ["iterable", "key=None"] },
        "sum": { sig: "sum(iterable, start=0)", params: ["iterable", "start=0"] },

        // Python - Módulos Math & Random
        "factorial": { sig: "factorial(n)", params: ["n"] },
        "gcd": { sig: "gcd(a, b)", params: ["a", "b"] },
        "isclose": { sig: "isclose(a, b, rel_tol=1e-9, abs_tol=0.0)", params: ["a", "b", "rel_tol=1e-9", "abs_tol=0.0"] },
        "randint": { sig: "randint(a, b)", params: ["a", "b"] },
        "choice": { sig: "choice(seq)", params: ["seq"] },
        "shuffle": { sig: "shuffle(x)", params: ["x"] },
        "uniform": { sig: "uniform(a, b)", params: ["a", "b"] },
        "random": { sig: "random()", params: [] }
    };

    // === BASE DE DADOS COMPLETA DE TOOLTIPS: C / C++ ===
    var cDocs = {
        "printf": "<b>int printf(const char *format, ...)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Escreve a saída formatada para stdout.</i>",
        "scanf": "<b>int scanf(const char *format, ...)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Atenção:</b> Lembre-se do operador <code>&</code> antes da variável (ex: <code>&amp;var</code>), exceto para strings!</div>",
        "gets": "<b>char* gets(char *str)</b><br><div style='color:#ff5555; margin-top:4px;'>⛔ <b>Perigo:</b> <code>gets()</code> é inseguro! Use <code>fgets(buf, sizeof(buf), stdin)</code>.</div>",
        "strcmp": "<b>int strcmp(const char *s1, const char *s2)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Pegadinha:</b> Retorna <b>0</b> quando as strings são <b>iguais</b>!</div>",
        "strncmp": "<b>int strncmp(const char *s1, const char *s2, size_t n)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Compara até n caracteres das duas strings.</i>",
        "strcpy": "<b>char* strcpy(char *dest, const char *src)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Copia a string src para dest.</i>",
        "strncpy": "<b>char* strncpy(char *dest, const char *src, size_t n)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Copia até n caracteres de src para dest.</i>",
        "strcat": "<b>char* strcat(char *dest, const char *src)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Concatena a string src ao final de dest.</i>",
        "strncat": "<b>char* strncat(char *dest, const char *src, size_t n)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Concatena até n caracteres de src ao final de dest.</i>",
        "strlen": "<b>size_t strlen(const char *str)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Retorna o número de caracteres (exclui o '\\0').</i>",
        "strchr": "<b>char* strchr(const char *str, int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Retorna ponteiro para a primeira ocorrência do caractere c.</i>",
        "strrchr": "<b>char* strrchr(const char *str, int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Retorna ponteiro para a última ocorrência do caractere c.</i>",
        "strstr": "<b>char* strstr(const char *haystack, const char *needle)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Procura a primeira ocorrência da substring needle em haystack.</i>",
        "strtok": "<b>char* strtok(char *str, const char *delim)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Divide a string em tokens com base nos delimitadores.</i>",
        "memset": "<b>void* memset(void *ptr, int value, size_t num)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Preenche num bytes do bloco de memória com o valor.</i>",
        "memcpy": "<b>void* memcpy(void *dest, const void *src, size_t num)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Copia num bytes da memória src para dest.</i>",
        "memmove": "<b>void* memmove(void *dest, const void *src, size_t num)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Copia num bytes (seguro para áreas sobrepostas).</i>",
        "memcmp": "<b>int memcmp(const void *ptr1, const void *ptr2, size_t num)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;string.h&gt;</code></small><br><i>Compara os primeiros num bytes de dois blocos de memória.</i>",
        "malloc": "<b>void* malloc(size_t size)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Aloca um bloco de memória de 'size' bytes. Verifique se o retorno não é NULL.</i>",
        "calloc": "<b>void* calloc(size_t num, size_t size)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Aloca memória para 'num' elementos zerados.</i>",
        "realloc": "<b>void* realloc(void *ptr, size_t new_size)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Redimensiona o bloco de memória alocado apontado por ptr.</i>",
        "free": "<b>void free(void *ptr)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Libera a memória alocada dinamicamente.</i>",
        "exit": "<b>void exit(int status)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Encerra a execução do programa enviando o código de status.</i>",
        "fopen": "<b>FILE* fopen(filename, mode)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Abre um arquivo. Retorna NULL em caso de erro.</i>",
        "fclose": "<b>int fclose(FILE *stream)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Fecha um fluxo de arquivo aberto.</i>",
        "fprintf": "<b>int fprintf(FILE *stream, const char *format, ...)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Escreve a saída formatada no fluxo de arquivo stream.</i>",
        "fscanf": "<b>int fscanf(FILE *stream, const char *format, ...)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Lê dados formatados do fluxo de arquivo stream.</i>",
        "fgets": "<b>char* fgets(char *str, int n, FILE *stream)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Lê até n-1 caracteres do fluxo stream.</i>",
        "fputs": "<b>int fputs(const char *str, FILE *stream)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Escreve a string str no fluxo de arquivo stream (sem '\\n' automático).</i>",
        "fread": "<b>size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Lê dados binários do arquivo.</i>",
        "fwrite": "<b>size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Escreve dados binários no arquivo.</i>",
        "FILE": "<b>Tipo: FILE</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdio.h&gt;</code></small><br><i>Estrutura/tipo opaco para representação e manipulação de fluxos de arquivo.</i>",
        "sqrt": "<b>double sqrt(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula a raiz quadrada de x.</i>",
        "pow": "<b>double pow(double base, double exp)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Retorna base elevada ao expoente.</i>",
        "ceil": "<b>double ceil(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Arredonda x para cima.</i>",
        "floor": "<b>double floor(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Arredonda x para baixo.</i>",
        "round": "<b>double round(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Arredonda x para o inteiro mais próximo.</i>",
        "abs": "<b>int abs(int x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdlib.h&gt;</code></small><br><i>Retorna o valor absoluto de x.</i>",
        "fabs": "<b>double fabs(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Valor absoluto em ponto flutuante.</i>",
        "sin": "<b>double sin(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula o seno de x (em radianos).</i>",
        "cos": "<b>double cos(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula o cosseno de x (em radianos).</i>",
        "tan": "<b>double tan(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula a tangente de x (em radianos).</i>",
        "log": "<b>double log(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Logaritmo natural (base e) de x.</i>",
        "log10": "<b>double log10(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Logaritmo na base 10 de x.</i>",
        "exp": "<b>double exp(double x)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula e elevado à potência x.</i>",
        "fmod": "<b>double fmod(double x, double y)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Resto da divisão em ponto flutuante x / y.</i>",
        "hypot": "<b>double hypot(double x, double y)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;math.h&gt;</code></small><br><i>Calcula a hipotenusa sqrt(x² + y²).</i>",
        "isdigit": "<b>int isdigit(int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;ctype.h&gt;</code></small><br><i>Verifica se o caractere é um dígito (0-9).</i>",
        "isalpha": "<b>int isalpha(int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;ctype.h&gt;</code></small><br><i>Verifica se o caractere é uma letra.</i>",
        "toupper": "<b>int toupper(int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;ctype.h&gt;</code></small><br><i>Converte o caractere para maiúsculo.</i>",
        "tolower": "<b>int tolower(int c)</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;ctype.h&gt;</code></small><br><i>Converte o caractere para minúsculo.</i>",
        "bool": "<b>Tipo booleano</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;stdbool.h&gt;</code></small><br><i>Suporta os valores <code>true</code> e <code>false</code>.</i>",
        "INT_MAX": "<b>INT_MAX</b><br><small style='color:#66d9ef;'>Requer: <code>#include &lt;limits.h&gt;</code></small><br><i>Maior valor de inteiro de 32 bits (2147483647).</i>",

        // KEYWORDS DE C / C++
        "if": "<b>Sintaxe C:</b> <code>if (condicao) { ... }</code><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Atenção:</b> Use <code>==</code> para comparação. Usar <code>=</code> atribui o valor!</div>",
        "else": "<b>Sintaxe C:</b> <code>else { ... }</code><br><i>Bloco alternativo executado caso a condição 'if' seja falsa.</i>",
        "for": "<b>Sintaxe C:</b> <code>for (init; cond; inc) { ... }</code><br><i>Exemplo: <code>for (int i = 0; i &lt; n; i++)</code></i>",
        "while": "<b>Sintaxe C:</b> <code>while (condicao) { ... }</code><br><i>Laço executado enquanto a condição for verdadeira.</i>",
        "do": "<b>Sintaxe C:</b> <code>do { ... } while (condicao);</code><br><i>Garante a execução do bloco ao menos uma vez antes do teste.</i>",
        "switch": "<b>Sintaxe C:</b> <code>switch (expressao) { case v: ... }</code><br><i>Seleção múltipla discreta com base em valores inteiros/char.</i>",
        "case": "<b>Sintaxe C:</b> <code>case valor:</code><br><i>Rótulo de opção dentro do 'switch'. Lembre-se do <code>break;</code> ao final do bloco.</i>",
        "default": "<b>Sintaxe C:</b> <code>default:</code><br><i>Caso padrão executado em um 'switch' se nenhum 'case' for atingido.</i>",
        "break": "<b>Sintaxe C:</b> <code>break;</code><br><i>Interrompe e encerra imediatamente o laço ou bloco 'switch' atual.</i>",
        "continue": "<b>Sintaxe C:</b> <code>continue;</code><br><i>Pula o restante do bloco e avança para a próxima iteração do laço.</i>",
        "return": "<b>Sintaxe C:</b> <code>return valor;</code><br><i>Finaliza a função e envia o valor de retorno ao chamador.</i>",
        "struct": "<b>Sintaxe C:</b> <code>struct Nome { tipo membro; };</code><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Lembre-se:</b> Coloque ponto e vírgula <code>;</code> após o fechamento da struct!</div>",
        "typedef": "<b>Sintaxe C:</b> <code>typedef tipo NovoNome;</code><br><i>Cria um apelido (alias) para um tipo de dado existente.</i>",
        "sizeof": "<b>Sintaxe C:</b> <code>sizeof(tipo_ou_var)</code><br><i>Operador que retorna o tamanho em bytes ocupado pelo tipo ou variável.</i>",
        "void": "<b>Tipo C:</b> <code>void</code><br><i>Indica ausência de tipo ou retorno de função.</i>",
        "char": "<b>Tipo C:</b> <code>char</code><br><i>Tipo inteiro de 1 byte usado para armazenar um caractere ASCII.</i>",
        "int": "<b>Tipo C:</b> <code>int</code><br><i>Tipo inteiro de precisão padrão do sistema (geralmente 4 bytes).</i>",
        "float": "<b>Tipo C:</b> <code>float</code><br><i>Tipo de número de ponto flutuante de precisão simples.</i>",
        "double": "<b>Tipo C:</b> <code>double</code><br><i>Tipo de número de ponto flutuante de precisão dupla.</i>",
        "const": "<b>Qualificador C:</b> <code>const</code><br><i>Declara a variável como constante (somente leitura).</i>",
        "static": "<b>Qualificador C:</b> <code>static</code><br><i>Preserva o valor da variável local entre chamadas de função.</i>"
    };

    // === BASE DE DADOS COMPLETA DE TOOLTIPS: PYTHON ===
    var pyDocs = {
        "print": "<b>print(*objects, sep=' ', end='\\n')</b><br><i>Imprime objetos na saída padrão.</i>",
        "len": "<b>len(s) -> int</b><br><i>Retorna o número de itens de uma sequência ou coleção.</i>",
        "range": "<b>range(stop) ou range(start, stop[, step])</b><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Pegadinha:</b> O valor final <code>stop</code> NÃO é incluído no intervalo!</div>",
        "open": "<b>open(file, mode='r')</b><br><i>Dica: prefira usar com <code>with open(...) as f:</code> para fechamento automático.</i>",
        "input": "<b>input(prompt='') -> str</b><br><i>Lê uma linha da entrada padrão e a retorna como string.</i>",
        "type": "<b>type(object) -> type</b><br><i>Retorna o tipo de dado do objeto.</i>",
        "map": "<b>map(funcao, iteravel)</b><br><i>Aplica a função a cada item. Retorna um iterador (use <code>list(map(...))</code>).</i>",
        "filter": "<b>filter(funcao, iteravel)</b><br><i>Retorna um iterador com os elementos onde a função retorna True.</i>",
        "reversed": "<b>reversed(seq)</b><br><i>Retorna um iterador reverso para a sequência.</i>",
        "round": "<b>round(number, ndigits=None)</b><br><i>Arredonda o número para a quantidade de dígitos informada.</i>",
        "sorted": "<b>sorted(iterable, key=None, reverse=False)</b><br><i>Retorna uma <b>nova lista</b> ordenada sem alterar a original.</i>",
        "int": "<b>int(x=0, base=10) -> int</b><br><i>Converte um número ou string em um inteiro.</i>",
        "float": "<b>float(x=0.0) -> float</b><br><i>Converte um número ou string em ponto flutuante.</i>",
        "str": "<b>str(object='') -> str</b><br><i>Retorna a representação em texto (string) de um objeto.</i>",
        "zip": "<b>zip(*iterables)</b><br><i>Agrupa elementos correspondentes de múltiplos iteráveis em tuplas.</i>",
        "enumerate": "<b>enumerate(iterable, start=0)</b><br><i>Retorna pares de (índice, elemento) ao iterar.</i>",
        "list": "<b>list(iterable=()) -> list</b><br><i>Construtor de lista mutável.</i>",
        "tuple": "<b>tuple(iterable=()) -> tuple</b><br><i>Construtor de tupla imutável.</i>",
        "min": "<b>min(iterable, key=None)</b><br><i>Retorna o menor elemento do iterável.</i>",
        "max": "<b>max(iterable, key=None)</b><br><i>Retorna o maior elemento do iterável.</i>",
        "sum": "<b>sum(iterable, start=0)</b><br><i>Soma os elementos do iterável.</i>",
        "abs": "<b>abs(x)</b><br><i>Retorna o valor absoluto de x.</i>",
        "pow": "<b>pow(base, exp)</b><br><i>Retorna base elevada ao expoente.</i>",

        "sqrt": "<b>math.sqrt(x)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Calcula a raiz quadrada de x.</i>",
        "ceil": "<b>math.ceil(x)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Arredonda x para cima.</i>",
        "floor": "<b>math.floor(x)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Arredonda x para baixo.</i>",
        "fabs": "<b>math.fabs(x)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Retorna o valor absoluto de x como float.</i>",
        "factorial": "<b>math.factorial(n)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Retorna o fatorial do inteiro n.</i>",
        "gcd": "<b>math.gcd(a, b)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Retorna o Maior Divisor Comum (MDC) de a e b.</i>",
        "isclose": "<b>math.isclose(a, b, rel_tol=1e-9)</b><br><small style='color:#66d9ef;'>Requer: <code>import math</code></small><br><i>Verifica se dois valores são numericamente próximos.</i>",
        "randint": "<b>random.randint(a, b)</b><br><small style='color:#66d9ef;'>Requer: <code>import random</code></small><br><i>Retorna um inteiro aleatório N tal que a &lt;= N &lt;= b (inclui b!).</i>",
        "choice": "<b>random.choice(seq)</b><br><small style='color:#66d9ef;'>Requer: <code>import random</code></small><br><i>Retorna um elemento aleatório de uma sequência não vazia.</i>",
        "shuffle": "<b>random.shuffle(x)</b><br><small style='color:#66d9ef;'>Requer: <code>import random</code></small><br><i>Embaralha a lista x in-place.</i>",
        "uniform": "<b>random.uniform(a, b)</b><br><small style='color:#66d9ef;'>Requer: <code>import random</code></small><br><i>Retorna um número float aleatório entre a e b.</i>",
        "random": "<b>random.random()</b><br><small style='color:#66d9ef;'>Requer: <code>import random</code></small><br><i>Retorna um número float no intervalo [0.0, 1.0).</i>",

        // KEYWORDS DE PYTHON
        "if": "<b>Sintaxe Python:</b> <code>if condicao:</code><br><div style='color:#ffaa00; margin-top:4px;'>⚠️ <b>Atenção:</b> Requer dois pontos <code>:</code> ao final e bloco indentado!</div>",
        "else": "<b>Sintaxe Python:</b> <code>else:</code><br><i>Bloco alternativo executado caso a condição seja falsa. Requer <code>:</code>.</i>",
        "elif": "<b>Sintaxe Python:</b> <code>elif condicao:</code><br><i>Condição alternativa encadeada. Requer dois pontos <code>:</code> ao final.</i>",
        "for": "<b>Sintaxe Python:</b> <code>for item in iterable:</code><br><i>Itera diretamente sobre elementos de um iterável. Requer <code>:</code>.</i>",
        "while": "<b>Sintaxe Python:</b> <code>while condicao:</code><br><i>Executa o bloco enquanto a condição for verdadeira. Requer <code>:</code>.</i>",
        "def": "<b>Sintaxe Python:</b> <code>def nome_funcao(params):</code><br><i>Declara uma função. Requer dois pontos <code>:</code> ao final.</i>",
        "class": "<b>Sintaxe Python:</b> <code>class NomeClasse:</code><br><i>Declara uma classe. Requer dois pontos <code>:</code> ao final.</i>",
        "try": "<b>Sintaxe Python:</b> <code>try:</code><br><i>Inicia o bloco monitorado para tratamento de exceções. Requer <code>:</code>.</i>",
        "except": "<b>Sintaxe Python:</b> <code>except Excecao as e:</code><br><i>Captura e trata exceções do bloco 'try'. Requer <code>:</code>.</i>",
        "finally": "<b>Sintaxe Python:</b> <code>finally:</code><br><i>Bloco executado obrigatoriamente após 'try/except'. Requer <code>:</code>.</i>",
        "raise": "<b>Sintaxe Python:</b> <code>raise Exception()</code><br><i>Lança manualmente uma exceção no programa.</i>",
        "with": "<b>Sintaxe Python:</b> <code>with expr as var:</code><br><i>Gerenciador de contexto (garante encerramento automático de recursos).</i>",
        "lambda": "<b>Sintaxe Python:</b> <code>lambda x: x + 1</code><br><i>Cria uma função anônima embutida inline.</i>",
        "import": "<b>Sintaxe Python:</b> <code>import modulo</code><br><i>Importa um módulo para o programa.</i>",
        "from": "<b>Sintaxe Python:</b> <code>from modulo import item</code><br><i>Importa elementos específicos de um módulo.</i>",
        "as": "<b>Sintaxe Python:</b> <code>import modulo as alias</code><br><i>Define um apelido para um módulo ou exceção.</i>",
        "pass": "<b>Sintaxe Python:</b> <code>pass</code><br><i>Instrução nula usada como preenchedor de bloco vazio.</i>",
        "yield": "<b>Sintaxe Python:</b> <code>yield valor</code><br><i>Pausa a função e retorna um valor, transformando-a em gerador.</i>",
        "break": "<b>Sintaxe Python:</b> <code>break</code><br><i>Interrompe e encerra o laço de repetição (for/while) atual.</i>",
        "continue": "<b>Sintaxe Python:</b> <code>continue</code><br><i>Pula o restante do bloco e avança para a próxima iteração.</i>",
        "return": "<b>Sintaxe Python:</b> <code>return valor</code><br><i>Finaliza a função e retorna o valor especificado.</i>",
        "in": "<b>Operador Python:</b> <code>x in container</code><br><i>Verifica se o elemento x pertence ao container ou cria laços 'for'.</i>",
        "is": "<b>Operador Python:</b> <code>a is b</code><br><i>Testa a identidade dos objetos (se apontam para a mesma memória).</i>",
        "not": "<b>Operador Lógico:</b> <code>not condicao</code><br><i>Inverte o valor booleano da expressão.</i>",
        "and": "<b>Operador Lógico:</b> <code>cond1 and cond2</code><br><i>Retorna True se ambas as condições forem verdadeiras.</i>",
        "or": "<b>Operador Lógico:</b> <code>cond1 or cond2</code><br><i>Retorna True se ao menos uma condição for verdadeira.</i>",
        "True": "<b>Valor Booleano:</b> <code>True</code><br><i>Representa o valor verdadeiro em Python (Note a inicial Maiúscula).</i>",
        "False": "<b>Valor Booleano:</b> <code>False</code><br><i>Representa o valor falso em Python (Note a inicial Maiúscula).</i>",
        "None": "<b>Valor Nulo:</b> <code>None</code><br><i>Representa a ausência de valor ou retorno nulo em Python.</i>"
    };

    // --- 3. INJEÇÃO AUTOMÁTICA DE BIBLIOTECAS (HEADER AUTO-IMPORT) ---
    function initHeaderAutoImport(editor) {
        editor.on("change", function(e) {
            if (e.action !== "insert") return;
            
            var session = editor.getSession();
            var fullMode = session.getMode().$id || "";
            var mode = fullMode.split("/").pop().toLowerCase();
            var code = session.getValue();

            var cursor = editor.getCursorPosition();
            var line = session.getLine(cursor.row);
            var match = line.substring(0, cursor.column).match(/\b([a-zA-Z_]\w*)$/);
            if (!match) return;

            var word = match[1];

            if (mode === 'c' || mode === 'cpp' || mode === 'c_cpp' || targetLang === 'c') {
                var reqHeader = cHeaderMap[word];
                if (reqHeader) {
                    var includeDirective = "#include <" + reqHeader + ">";
                    if (code.indexOf(includeDirective) === -1 && code.indexOf("<" + reqHeader + ">") === -1) {
                        session.insert({ row: 0, column: 0 }, includeDirective + "\n");
                        console.log("%c[VPL ACE] Header auto-injetado: " + includeDirective, "color: #00ff00;");
                    }
                }
            } else if (mode === 'python' || mode === 'py' || targetLang === 'python') {
                var reqModule = pyHeaderMap[word];
                if (reqModule) {
                    var importDirective = "import " + reqModule;
                    if (code.indexOf(importDirective) === -1) {
                        session.insert({ row: 0, column: 0 }, importDirective + "\n");
                        console.log("%c[VPL ACE] Módulo auto-importado: " + importDirective, "color: #00ff00;");
                    }
                }
            }
        });
    }

    // --- 4. DICAS DE PARÂMETROS ATIVOS (PARAMETER HINTS / SIGNATURE HELP) ---
    function initParameterHints(editor) {
        var hintEl = document.getElementById('vpl-ace-param-hint');
        if (!hintEl) {
            hintEl = document.createElement('div');
            hintEl.id = 'vpl-ace-param-hint';
            hintEl.style.cssText = [
                'position: fixed', 'z-index: 999999', 'display: none',
                'background: #252526', 'color: #cccccc', 'padding: 6px 10px',
                'border-radius: 4px', 'font-family: monospace', 'font-size: 12px',
                'box-shadow: 0 4px 10px rgba(0,0,0,0.5)', 'border: 1px solid #007acc',
                'pointer-events: none'
            ].join(';');
            document.body.appendChild(hintEl);
        }

        function updateParameterHint() {
            var cursor = editor.getCursorPosition();
            var session = editor.getSession();
            var line = session.getLine(cursor.row).substring(0, cursor.column);

            var funcMatch = line.match(/\b([a-zA-Z_]\w*)\s*\(([^)]*)$/);
            if (funcMatch) {
                var funcName = funcMatch[1];
                var argsText = funcMatch[2];
                var paramIndex = argsText.split(',').length - 1;

                var info = signatureHelpDB[funcName];
                if (info) {
                    var formattedParams = info.params.map(function(p, idx) {
                        if (idx === paramIndex) {
                            return "<b style='color:#569cd6; text-decoration:underline;'>" + p + "</b>";
                        }
                        return p;
                    }).join(", ");

                    var coords = editor.renderer.textToScreenCoordinates(cursor.row, cursor.column);
                    hintEl.innerHTML = "<span style='color:#dcdcdc;'>" + funcName + "(</span>" + formattedParams + "<span style='color:#dcdcdc;'>)</span>";
                    hintEl.style.left = coords.pageX + "px";
                    hintEl.style.top = (coords.pageY + 20) + "px";
                    hintEl.style.display = 'block';
                    return;
                }
            }
            hintEl.style.display = 'none';
        }

        editor.selection.on("changeCursor", updateParameterHint);
    }

    // --- 5. AUTOCOMPLETE CUSTOMIZADO (STRUCTS, PYTHON METHODS, FORMATADORES %) ---
    function initCustomCompleters(editor, langTools) {
        if (!langTools || typeof langTools.addCompleter !== "function") return;

        var customCompleter = {
            getCompletions: function(editor, session, pos, prefix, callback) {
                var line = session.getLine(pos.row).substring(0, pos.column);
                var fullMode = session.getMode().$id || "";
                var mode = fullMode.split("/").pop().toLowerCase();

                if (line.endsWith("%") || /%[a-zA-Z0-9\.]*$/.test(line)) {
                    var specifiers = [
                        { caption: "%d (int)", value: "d", meta: "especificador", score: 2000 },
                        { caption: "%f (float)", value: "f", meta: "especificador", score: 2000 },
                        { caption: "%.2f (float 2 casas)", value: ".2f", meta: "especificador", score: 2000 },
                        { caption: "%lf (double)", value: "lf", meta: "especificador", score: 2000 },
                        { caption: "%c (char)", value: "c", meta: "especificador", score: 2000 },
                        { caption: "%s (string)", value: "s", meta: "especificador", score: 2000 },
                        { caption: "%p (ponteiro)", value: "p", meta: "especificador", score: 2000 },
                        { caption: "%zu (size_t)", value: "zu", meta: "especificador", score: 2000 }
                    ];
                    return callback(null, specifiers);
                }

                if ((mode === 'c' || mode === 'cpp' || mode === 'c_cpp') && (line.endsWith('.') || line.endsWith('->'))) {
                    var code = session.getValue();
                    var structMembers = [];
                    var structRegex = /struct\s+\w*\s*\{([^}]+)\}/g;
                    var match;
                    while ((match = structRegex.exec(code)) !== null) {
                        var body = match[1];
                        var memberLines = body.split(';');
                        memberLines.forEach(function(m) {
                            var tokens = m.trim().split(/\s+/);
                            if (tokens.length >= 2) {
                                var fieldName = tokens[tokens.length - 1].replace('*', '');
                                if (fieldName) {
                                    structMembers.push({
                                        caption: fieldName,
                                        value: fieldName,
                                        meta: "membro struct",
                                        score: 3000
                                    });
                                }
                            }
                        });
                    }
                    if (structMembers.length > 0) {
                        return callback(null, structMembers);
                    }
                }

                if ((mode === 'python' || mode === 'py') && line.endsWith('.')) {
                    var pyMethods = [
                        { caption: "append(x)", value: "append(${1:x})", snippet: "append(${1:x})", meta: "método lista", score: 2000 },
                        { caption: "split(sep)", value: "split()", snippet: "split(${1:sep})", meta: "método string", score: 2000 },
                        { caption: "strip()", value: "strip()", meta: "método string", score: 2000 },
                        { caption: "replace(old, new)", value: "replace()", snippet: "replace('${1:old}', '${2:new}')", meta: "método string", score: 2000 },
                        { caption: "join(iterable)", value: "join()", snippet: "join(${1:iterable})", meta: "método string", score: 2000 },
                        { caption: "get(key, default)", value: "get()", snippet: "get(${1:key}, ${2:None})", meta: "método dict", score: 2000 },
                        { caption: "keys()", value: "keys()", meta: "método dict", score: 2000 },
                        { caption: "values()", value: "values()", meta: "método dict", score: 2000 },
                        { caption: "items()", value: "items()", meta: "método dict", score: 2000 }
                    ];
                    return callback(null, pyMethods);
                }

                callback(null, []);
            }
        };

        langTools.addCompleter(customCompleter);
    }

    // --- 6. GERENCIADOR DE TOOLTIPS ON-HOVER CONTEXTUAL ---
    function initHoverTooltips(editor) {
        var tooltipEl = document.getElementById('vpl-ace-hover-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'vpl-ace-hover-tooltip';
            tooltipEl.style.cssText = [
                'position: fixed', 'z-index: 999999', 'display: none',
                'background: #1e1e1e', 'color: #dcdcdc', 'padding: 8px 12px',
                'border-radius: 5px', 'font-family: monospace, sans-serif',
                'font-size: 12px', 'line-height: 1.4', 'box-shadow: 0 4px 14px rgba(0,0,0,0.4)',
                'border: 1px solid #454545', 'max-width: 380px', 'pointer-events: none'
            ].join(';');
            document.body.appendChild(tooltipEl);
        }

        editor.on("mousemove", function(e) {
            var position = e.getDocumentPosition();
            var token = editor.getSession().getTokenAt(position.row, position.column);

            if (token && token.value) {
                var fullMode = editor.getSession().getMode().$id || "";
                var currentMode = fullMode.split("/").pop().toLowerCase();
                var doc = null;

                var isPyMode = (currentMode === 'python' || currentMode === 'py' || targetLang === 'python' || targetLang === 'py');
                var isCMode = (currentMode === 'c' || currentMode === 'cpp' || currentMode === 'c_cpp' || targetLang === 'c' || targetLang === 'cpp');

                if (isPyMode) {
                    doc = pyDocs[token.value] || (targetLang === 'both' ? cDocs[token.value] : null);
                } else if (isCMode) {
                    doc = cDocs[token.value] || (targetLang === 'both' ? pyDocs[token.value] : null);
                } else {
                    doc = cDocs[token.value] || pyDocs[token.value];
                }

                if (doc) {
                    var clientX = e.clientX || (e.domEvent && e.domEvent.clientX);
                    var clientY = e.clientY || (e.domEvent && e.domEvent.clientY);

                    tooltipEl.innerHTML = doc;
                    tooltipEl.style.left = (clientX + 12) + 'px';
                    tooltipEl.style.top = (clientY + 15) + 'px';
                    tooltipEl.style.display = 'block';
                    return;
                }
            }
            tooltipEl.style.display = 'none';
        });

        editor.on("mouseout", function() { tooltipEl.style.display = 'none'; });
        editor.getSession().on("changeScrollTop", function() { tooltipEl.style.display = 'none'; });
    }

    // --- 7. ANALISADOR SINTÁTICO NATIVO (LINTER) ---
    function initNativeLinter(editor) {
        var session = editor.getSession();

        function validateSyntax() {
            var fullMode = session.getMode().$id || "";
            var mode = fullMode.split("/").pop().toLowerCase();
            var code = session.getValue();
            var lines = code.split("\n");
            var annotations = [];
            var stack = [];
            var pairs = { '}': '{', ')': '(', ']': '[' };
            var inBlockComment = false;

            for (var r = 0; r < lines.length; r++) {
                var line = lines[r];
                var inString = false;
                var stringChar = '';

                for (var c = 0; c < line.length; c++) {
                    var ch = line[c];
                    var next = line[c + 1];

                    if (!inString && mode !== 'python' && mode !== 'py') {
                        if (inBlockComment) {
                            if (ch === '*' && next === '/') { inBlockComment = false; c++; }
                            continue;
                        } else if (ch === '/' && next === '*') {
                            inBlockComment = true; c++; continue;
                        } else if (ch === '/' && next === '/') { break; }
                    } else if (!inString && (mode === 'python' || mode === 'py') && ch === '#') {
                        break;
                    }

                    if (inString) {
                        if (ch === stringChar && line[c - 1] !== '\\') inString = false;
                        continue;
                    } else if (ch === '"' || ch === "'") {
                        inString = true; stringChar = ch; continue;
                    }

                    if (ch === '{' || ch === '(' || ch === '[') {
                        stack.push({ char: ch, row: r, col: c });
                    } else if (ch === '}' || ch === ')' || ch === ']') {
                        if (stack.length === 0 || stack[stack.length - 1].char !== pairs[ch]) {
                            annotations.push({
                                row: r, column: c,
                                text: "Fechamento '" + ch + "' desbalanceado ou sem abertura.",
                                type: "error"
                            });
                        } else { stack.pop(); }
                    }
                }

                if (inString && mode !== 'python' && mode !== 'py') {
                    annotations.push({
                        row: r, column: line.length,
                        text: "String não encerrada (aspas " + stringChar + " ausente).",
                        type: "error"
                    });
                }

                var trimmed = line.trim();

                if (mode === 'c' || mode === 'cpp' || mode === 'c_cpp') {
                    if (trimmed.indexOf('#include') === 0 && trimmed.indexOf('<') !== -1 && trimmed.indexOf('>') === -1) {
                        annotations.push({
                            row: r, column: line.length,
                            text: "Diretiva #include <...> sem '>' de fechamento.",
                            type: "error"
                        });
                    }
                }

                if (mode === 'python' || mode === 'py') {
                    var controlKeywords = /^(if|elif|else|for|while|def|class|try|except|with)\b/;
                    if (controlKeywords.test(trimmed) && !trimmed.endsWith(':') && !trimmed.endsWith('\\') && trimmed.indexOf('#') === -1) {
                        annotations.push({
                            row: r, column: line.length,
                            text: "Sintaxe Python: instrução de controle deve terminar com ':'.",
                            type: "warning"
                        });
                    }
                }
            }

            while (stack.length > 0) {
                var unclosed = stack.pop();
                annotations.push({
                    row: unclosed.row, column: unclosed.col,
                    text: "Símbolo '" + unclosed.char + "' aberto não foi fechado.",
                    type: "error"
                });
            }

            if (inBlockComment) {
                annotations.push({
                    row: lines.length - 1, column: 0,
                    text: "Comentário de bloco '/*' não encerrado.",
                    type: "error"
                });
            }

            session.setAnnotations(annotations);
        }

        var debounceTimer;
        session.on("change", function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(validateSyntax, 350);
        });

        validateSyntax();
    }

    // --- CONFIGURAÇÕES NATIVAS ACE E SNIPPETS ---
    function applyOptionsAndSnippets(editor, langTools) {
        editor.setOptions({
			scrollPastEnd: 1,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true
        });

        if (langTools && langTools.snippetCompleter) {
            if (editor.completers && !editor.completers.includes(langTools.snippetCompleter)) {
                editor.completers.push(langTools.snippetCompleter);
            }
        }

        function registerAllSnippets(snippetManager) {
            var cCppSnippets = [
                "snippet main", "\tint main(int argc, char const *argv[]) {\n\t\t${1:// codigo}\n\t\treturn 0;\n\t}",
                "snippet inc", "\t#include <${1:stdio.h}>",
                "snippet for", "\tfor (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t\t${3}\n\t}",
                "snippet while", "\twhile (${1:condicao}) {\n\t\t${2}\n\t}",
                "snippet if", "\tif (${1:condicao}) {\n\t\t${2}\n\t}",
                "snippet printf", "\tprintf(\"${1:%s\\n}\", ${2});",
                "snippet scanf", "\tscanf(\"${1:%d}\", &${2:var});"
            ].join("\n");

            var pythonSnippets = [
                "snippet main", "\tif __name__ == '__main__':\n\t\t${1:main()}",
                "snippet def", "\tdef ${1:nome_funcao}(${2:params}):\n\t\t\"\"\"${3:docstring}\"\"\"\n\t\t${4:pass}",
                "snippet for", "\tfor ${1:item} in ${2:iterable}:\n\t\t${3:pass}",
                "snippet while", "\twhile (${1:condicao}):\n\t\t${2:pass}"
            ].join("\n");

            var fullMode = editor.getSession().getMode().$id || "";
            var currentModeName = fullMode.split("/").pop();

            function register(text, modes) {
                modes.forEach(function(m) {
                    var parsed = snippetManager.parseSnippetFile(text, m);
                    snippetManager.register(parsed, m);
                });
            }

            var loadC = ["c", "c_cpp", "cpp", "both"].includes(targetLang);
            var loadPy = ["python", "py", "both"].includes(targetLang);

            if (loadC) register(cCppSnippets, ["c_cpp", "c", "cpp", currentModeName]);
            if (loadPy) register(pythonSnippets, ["python", "py", currentModeName]);
        }

        var snippetModule = (window.ace && ace.require) ? ace.require("ace/snippets") : null;
        var snippetManager = snippetModule ? (snippetModule.snippetManager || snippetModule) : null;

        if (snippetManager && typeof snippetManager.parseSnippetFile === "function") {
            registerAllSnippets(snippetManager);
        } else if (window.ace && ace.config && typeof ace.config.loadModule === "function") {
            ace.config.loadModule("ace/snippets", function(m) {
                var sm = m ? (m.snippetManager || m) : null;
                if (sm && typeof sm.parseSnippetFile === "function") {
                    registerAllSnippets(sm);
                }
            });
        }

        console.log("%c[VPL ACE] Enhancer on!", "color: #00ff00; font-weight: bold;");
    }
})();