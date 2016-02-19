var DATA = [];
var STACK = {};
var STACK_TID = null;

var formatCallParams = function(data) {
	var arr = [];
	var jsonArr = [];

	for (var i=0;i<data.length;i++) {
		var item = data[i];

		if (item === null) {
			arr.push("null");
		} else if (item instanceof Array) {
			arr.push("[...]");
			jsonArr.push(item);
		} else if (typeof(item) == "object") {
			arr.push("{...}");
			jsonArr.push(item);
		} else {
			arr.push(item);
		}
	}

	return "(" + arr.join(", ") + ")";
}

var formatException = function(e) {
	var result = document.createElement("strong");
	result.style.color = "red";
	result.innerHTML = e.message;
	return result;
}

var formatArrow = function(type) {
	var node = document.createElement("strong");
	node.style.color = (type ? "green" : "blue");
	node.innerHTML = (type ? "←" : "→");
	return node;
}

var createRow = function(opt) {
	var row = document.createElement("div");
	row.title = "Click to open in a window";
	if (opt.green) {
		row.style.background = "#9CFF82";
	}
	row.setAttribute("data-ind", opt.ind);

	opt = opt || {};

	var ar = [].concat(opt.values || []);

	for (var i=0;i<ar.length;i++) {
		var item = ar[i];
		if (!item.nodeType) {
			item = document.createTextNode(item);
		}
		else {
			item = item.cloneNode(true);
		}
		row.appendChild(item);
		row.appendChild(document.createTextNode(" "));
	}

	return row;
};

var runStack = function() {
	var matches = {};
	var save = [];

	var stackConns = Object.keys(STACK);

	stackConns.forEach(function(conn) {
		var item = STACK[conn];

		if (item.length == 2) {
			var ind = DATA.length;
			var request = item[0];
			var response = item[1];

			var reqItem = {
				values: request.values,
				data: request.data,
				green: true,
				ind: ind
			};

			DATA.push(reqItem);

			var resValues = response.values;

			if (request.method) {
				var method = document.createElement("strong");
				method.innerHTML = request.method;

				resValues.splice(3, 0, method);
			}

			var resItem = {
				values: resValues,
				data: response.data,
				ind: ind + 1
			};

			DATA.push(resItem);

			var fragment = new DocumentFragment();
			fragment.appendChild(createRow(reqItem));
			fragment.appendChild(createRow(resItem));

			var logEl = document.querySelector("#log");
			logEl.appendChild(fragment);

			document.body.scrollTop = document.body.scrollHeight;

			delete STACK[conn];
		}
	});
};

var humanLength = function(size) {
	if (size < 1024) {
		return size + " B";
	}
	else if (size >= 1024 && size <= 1024*1024) {
		size = (size / 1024).toFixed(2);

		return size + " KB";
	}
	else {
		size = (size / (1024 * 1024)).toFixed(2);

		return size + " MB";
	}
};

var logRequest = function(data, harEntry) {
	var arrow = formatArrow(0);
	var conn = harEntry.connection;

	try {
		var binary = JAK.Base64.atob(data.postData.text);
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = parsed.method;

		var callParams = formatCallParams(parsed.params);
		
		STACK[conn] = [{
			conn: conn,
			type: "request",
			data: parsed.params,
			method: parsed.method,
			values: ["FRPC", arrow, data.url, method, callParams]
		}];
	} catch (e) {
	}
}

var logResponse = function(data, content, harEntry) {
	var arrow = formatArrow(1);
	var conn = harEntry.connection;

	try {
		var decoded = atob(content);
		var binary = JAK.Base64.atob(decoded);
		var parsed = JAK.FRPC.parse(binary);

		if (STACK[conn]) {
			STACK[conn].push({
				conn: conn,
				type: "response",
				data: parsed,
				values: ["FRPC", arrow, harEntry.request.url, humanLength(data.bodySize)]
			});

			if (STACK_TID) {
				clearTimeout(STACK_TID);
				STACK_TID = null;
			}

			STACK_TID = setTimeout(function() {
				runStack();
			}, 20);
		}
	} catch (e) {
	}
}

var isFRPC = function(headers) {
	for (var i=0;i<headers.length;i++) {
		var header = headers[i];
		if (header.name.toLowerCase() != "content-type") { continue; }
		if (header.value == "application/x-base64-frpc") { return true; }
	}
	return false;
}

var processItem = function(harEntry) {
	var request = harEntry.request;

	if (isFRPC(request.headers)) { 
		logRequest(request, harEntry);
	}

	var response = harEntry.response;
	if (isFRPC(response.headers)) { 
		harEntry.getContent(function(content) {
			logResponse(response, content, harEntry)
		});
	}
}

var processItems = function(result) {
	var entries = result.entries;
	for (var i=0;i<entries.length;i++) {
		processItem(entries[i]);
	}
}

function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

chrome.devtools.network.onRequestFinished.addListener(processItem);
chrome.devtools.network.getHAR(processItems);

document.querySelector("#clear").addEventListener("click", function(e) {
	DATA = [];
	STACK = {};
	STACK_TID = null;
	document.querySelector("#log").innerHTML = "";
});

document.querySelector("#log").addEventListener("click", function(e) {
	var target = e.target;
	var row = null;

	while (target.parentNode) {
		if (target.parentNode.id == "log") { row = target; }
		target = target.parentNode;
	}
	if (!row) { return; }

	var ind = row.getAttribute("data-ind") || "-1";
	ind = parseInt(ind, 10);

	if (ind >= 0 && ind < DATA.length) {
		var data = DATA[ind];
		var w = window.open();

		w.document.head.innerHTML = '<style>' +
		'pre { padding: 5px; margin: 5px; font-size: 14px; }' +
		'.string { color: green; }' +
		'.number { color: blue; }' +
		'.boolean { color: blue; }' +
		'.null { color: magenta; }' +
		'.key { color: black; font-weight: bold; }' +
		'</style>';

		var p = document.createElement("p");
		p.style.fontSize = "20px";
		var pInfo = document.createElement("span");
		pInfo.innerHTML = "";
		p.appendChild(pInfo);

		data.values.forEach(function(i) {
			var span = document.createElement("span");
			span.innerHTML = "";
			span.style.marginLeft = "15px";

			if (i.toString().indexOf("[object HTML") != -1) {
				p.appendChild(i.cloneNode(true));
			}
			else {
				var s = document.createElement("strong");
				s.innerHTML = i;
				p.appendChild(s);
			}

			p.appendChild(span);
		});

		w.document.body.appendChild(p);

		w.document.body.appendChild(document.createElement("hr"));

		var pre = document.createElement("pre");
		pre.innerHTML = syntaxHighlight(JSON.stringify(data.data, undefined, 4));
		w.document.body.appendChild(pre);
	}
});
