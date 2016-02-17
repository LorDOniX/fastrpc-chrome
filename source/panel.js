var DATA = {};

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

var createRow = function(opt, replaceEl) {
	var row = replaceEl || document.createElement("div");

	if (replaceEl) {
		row.innerHTML = "";
	}

	row.title = "Click to open in a window";
	if (opt.type == "request") {
		row.style.background = "#9CFF82";
	}
	row.setAttribute("data-type", opt.type);
	row.setAttribute("data-conn", opt.conn);

	opt = opt || {};

	var ar = [].concat(opt.values || []);

	for (var i=0;i<ar.length;i++) {
		var item = ar[i];
		if (!item.nodeType) {
			item = document.createTextNode(item);
		}
		row.appendChild(item);
		row.appendChild(document.createTextNode(" "));
	}

	return row;
};

var requestLog = function(dataItem) {
	dataItem.request.el = createRow({
		values: dataItem.request.values,
		type: "request",
		conn: dataItem.conn
	});

	dataItem.response.el = document.createElement("div");
	dataItem.response.el.innerHTML = "Waiting for request...";

	var logEl = document.querySelector("#log");

	logEl.appendChild(dataItem.request.el);
	logEl.appendChild(dataItem.response.el);

	document.body.scrollTop = document.body.scrollHeight;
}

var responseLog = function(dataItem) {
	dataItem.response.el = createRow({
		values: dataItem.response.values,
		type: "response",
		conn: dataItem.conn
	}, dataItem.response.el);
}

var logRequest = function(data, conn) {
	var arrow = formatArrow(0);
	var dataItem = {
		conn: conn,
		request: {
			el: null,
			values: null,
			data: null,
			method: ""
		},
		response: {
			el: null,
			values: null,
			data: null
		}
	};

	try {
		var binary = JAK.Base64.atob(data.postData.text);
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = parsed.method;

		var callParams = formatCallParams(parsed.params);
		
		dataItem.request.values = ["FRPC", arrow, data.url, method, callParams];
		dataItem.request.data = parsed.params;
		dataItem.request.method = parsed.method;
	} catch (e) {
		dataItem.requestvalues = ["FRPC", arrow, data.url, formatException(e)];
		dataItem.data = e;
	}

	DATA[conn] = dataItem;
	requestLog(dataItem);
}

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

var logResponse = function(data, content, harEntry) {
	var arrow = formatArrow(1);
	var conn = harEntry.connection;
	var dataItem = DATA[conn];

	try {
		var decoded = atob(content);
		var binary = JAK.Base64.atob(decoded);
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = dataItem.request.method;

		dataItem.response.data = parsed;
		dataItem.response.values = ["FRPC", arrow, harEntry.request.url, "|", method, humanLength(data.bodySize)];
	} catch (e) {
		dataItem.response.data = e;
		dataItem.response.values = ["FRPC", arrow, formatException(e)];
	}

	responseLog(dataItem);
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
	var conn = harEntry.connection;

	if (isFRPC(request.headers)) { 
		logRequest(request, conn);
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
	DATA = {};
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

	var dataType = row.getAttribute("data-type") || "";
	var dataConn = row.getAttribute("data-conn") || "";

	if (dataConn in DATA && DATA[dataConn][dataType]) {
		var data = DATA[dataConn][dataType];
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
