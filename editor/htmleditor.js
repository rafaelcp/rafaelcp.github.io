var updating = true;
if (localStorage.updating) {
	updating = localStorage.updating == 'true' ? true : false;
}
var area = document.getElementsByTagName('textarea')[0];
var iframe = document.getElementsByTagName('iframe')[0];
var autoruncheck = document.getElementById('autorun');
var autorundiv = document.getElementById('autorundiv');
var btrun = document.getElementById('btrun');
var btvalidator = document.getElementById('btvalidator');
var downloadlink = document.getElementById('download');
autoruncheck.checked = updating;
btrun.style.display = updating ? 'none' : 'inline';
btrun.addEventListener('click', function(e) { update({target: {value: editor.getValue()}}) });
btvalidator.addEventListener('click', function(e) { validate(editor.getValue()) });
area.addEventListener('change', update);
autoruncheck.addEventListener('change', function (e) {
	updating = localStorage.updating = e.target.checked;
	btrun.style.display = updating ? 'none' : 'inline';
});
const query = matchMedia('(orientation: portrait)');
query.onchange = function(event) {
  if (query.matches) {
	area_.style.width = '100%';
	area_.style.height = '50%';
  }
  else {
	area_.style.width = '50%';
	area_.style.height = '100%';	  
  }
}
document.addEventListener('DOMContentLoaded', function() {
	if (localStorage.content) {
		area.value = localStorage.content;
	}
	update({target: {value: area.value}});
	editor.setValue(area.value);
	var s = new URLSearchParams(window.location.search);
	if (s.has('gist')) {
		var g = s.get('gist');
		fetch('https://api.github.com/gists/'+ g)
		.then((e)=>e.json())
		.then((e)=>{
				for (f in e.files) { 
					area.value = e.files[f].content;
					update({target: {value: area.value}});
					editor.setValue(area.value);
					window.location.search = '';
					break;
				}
			});
	}
});
var editor = CodeMirror.fromTextArea(area, {
	styleActiveLine: true,
	highlightSelectionMatches: true,
	matchBrackets: true,
	matchTags: true,
    lineNumbers: true,
	autoCloseBrackets: true,
	autoCloseTags: true,
	mode: "htmlmixed",
	foldGutter: true,
	extraKeys: { "Ctrl-Space": "autocomplete", "Ctrl-Q": "toggleComment" },
	lineWrapping: true,
	autofocus: true,
    gutters: ["CodeMirror-lint-markers", "CodeMirror-foldgutter"],
    lint: {esversion: 10},
	allowDropFileTypes: ['text/html'],
	undoDepth: 9999
  });
editor.on('change', function(ed) {
	var txt = ed.getValue();
	localStorage.content = txt;
	downloadlink.href = toDataURL(txt);
	if (updating) {
		var e = {target: {value: txt}};
		update(e);
	}
});
//editor.setValue(area.value);
downloadlink.addEventListener('click', function(e) {
	var d = new Date();
	downloadlink.download = d.toLocaleString() + '.html';	
});
var area_ = document.querySelector('.CodeMirror.cm-s-default');
autorundiv.remove();
area_.appendChild(autorundiv);
function update(e) {
	//var newdataurl = toDataURL(e.target.value);
	//if (newdataurl == iframe.src) return;
//	var newiframe = document.createElement('iframe');
//	console.log(newiframe);
//	newiframe.style.display = 'none';
//	newiframe.src = newdataurl;
	iframe.contentWindow.document.open();
	iframe.contentWindow.document.write(e.target.value);
	iframe.contentWindow.document.close();
	/*document.body.appendChild(newiframe);
	newiframe.onload = function() {
		iframe.remove();
		newiframe.style.display = 'block';
		iframe = newiframe;
	}*/
}
function b64EncodeUnicode(str) {
	// first we use encodeURIComponent to get percent-encoded UTF-8,
	// then we convert the percent encodings into raw bytes which
	// can be fed into btoa.
	return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
		function toSolidBytes(match, p1) {
			return String.fromCharCode('0x' + p1);
	}));
}
function toDataURL(text) {
	return 'data:text/html;charset=utf-8;base64,' + b64EncodeUnicode(text);
}
async function postData(url = '', txt = '') {
  // Default options are marked with *
  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'text/html;charset=utf-8'
    },
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    body: txt
  });
  return response.json();
}
function validate(html) {
	postData('https://validator.nu/?out=json', html)
	.then(data => {
		if (data.messages.length == 0) {
			var marker = document.createElement("div");
			marker.setAttribute('class', 'CodeMirror-lint-marker');
			marker.setAttribute('title', 'Valid Document!');
			marker.style.color = 'lime';
			marker.innerHTML = '✓';
			alert('Valid Document!');

			editor.setGutterMarker(0, 'CodeMirror-lint-markers', marker);		
		}
		else {
			for (var i in data.messages) {
				var error = data.messages[i];
				var errorLine = error['lastLine'] - 1;
				var marker = document.createElement("div");
				marker.setAttribute('class', 'CodeMirror-lint-marker CodeMirror-lint-marker-error');
				marker.setAttribute('title', '(Validation Error) ' + error['message']);

				editor.setGutterMarker(errorLine, 'CodeMirror-lint-markers', marker);
			}
		}
	});
}