var DATA = [];

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
	row.classList.add("log-line");

	row.title = "Click to open in a window";

	opt = opt || {};

	if (opt.green) {
		row.style.background = "#9CFF82";
	}
	
	row.setAttribute("data-ind", opt.ind);

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

var setRequestData = function(data, header) {
	var arrow = formatArrow(0);
	var dataText = data.postData.text;
	var item;

	try {
		if (header.indexOf("base64") > -1) { dataText = atob(dataText); }
		var binary = dataText.split("").map(function(ch) { return ch.charCodeAt(0); })
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = parsed.method;

		var callParams = formatCallParams(parsed.params);

		item = {
			data: parsed.params,
			green: true,
			method: parsed.method,
			values: ["FRPC", arrow, data.url, method, callParams],
			ind: DATA.length
		};
	}
	catch (e) {
		item = {
			ind: DATA.length,
			data: e,
			values: ["FRPC", arrow, formatException(e)]
		};
	}

	DATA.push(item);
	oneRow(item);
}

var oneRow = function(opt) {
	var logEl = document.querySelector("#log");
	logEl.appendChild(createRow(opt));

	document.body.scrollTop = document.body.scrollHeight;
}

var setResponseData = function(data, content, harEntry, header) {
	var arrow = formatArrow(1);
	var item;

	try {
		var decoded = atob(content);
		if (header.indexOf("base64") > -1) { decoded = atob(decoded); }
		var binary = decoded.split("").map(function(ch) { return ch.charCodeAt(0); });
		var parsed = JAK.FRPC.parse(binary);

		item = {
			ind: DATA.length,
			data: parsed,
			values: ["FRPC", arrow, harEntry.request.url, humanLength(data.bodySize)]
		};
	}
	catch (e) {
		item = {
			ind: DATA.length,
			data: e,
			values: ["FRPC", arrow, formatException(e)]
		};
	}

	DATA.push(item);
	oneRow(item);
}

var isFRPC = function(headers) {
	for (var i=0;i<headers.length;i++) {
		var header = headers[i];
		if (header.name.toLowerCase() != "content-type") { continue; }
		if (header.value == "application/x-base64-frpc" || header.value == "application/x-frpc") { return header.value; }
	}

	return false;
}

var processItem = function(harEntry) {
	var request = harEntry.request;
	var requestHeader = isFRPC(request.headers);
	if (requestHeader) { 
		setRequestData(request, requestHeader);
	}

	var response = harEntry.response;
	var responseHeader = isFRPC(response.headers);
	if (responseHeader) { 
		harEntry.getContent(function(content) {
			setResponseData(response, content, harEntry, responseHeader)
		});
	}
}

var processItems = function(result) {
	var entries = result.entries;
	for (var i=0;i<entries.length;i++) {
		processItem(entries[i]);
	}
}

chrome.devtools.network.onRequestFinished.addListener(processItem);
chrome.devtools.network.getHAR(processItems);

document.querySelector("#clear").addEventListener("click", function(e) {
	DATA = [];
	document.querySelector("#log").innerHTML = "";
});

document.querySelector("#log").addEventListener("click", function(e) {
	var target = e.target;
	var ind;

	while (target.parentNode) {
		var ind = target.getAttribute("data-ind");

		if (!ind) {
			target = target.parentNode;

			if (target.parentNode.tagName.toLowerCase() == "body") break;
		}
		else {
			break;
		}
	}

	if (!ind) { return; }

	ind = parseInt(ind, 10);

	if (ind >= 0 && ind < DATA.length) {
		var data = DATA[ind];
		var w = window.open("about:blank", "");
		var jsonPre = document.createElement("pre");

		$(jsonPre).jsonViewer(data.data, {
			collapsed: false
		});

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

		// https://cssminifier.com/ jquery.json-viewer.css
		w.document.head.innerHTML = '<meta charset="utf-8"><style>' +
		'body { font-size: 14px; }' +
		'/* Syntax highlighting for JSON objects */'+
		'ul.json-dict, ol.json-array {'+
		  'list-style-type: none;'+
		  'margin: 0 0 0 1px;'+
		  'border-left: 1px dotted #ccc;'+
		  'padding-left: 2em;'+
		'}'+
		'.json-string {'+
		  'color: #0B7500;'+
		'}'+
		'.json-literal {'+
		  'color: #1A01CC;'+
		  'font-weight: bold;'+
		'}'+
		''+
		'/* Toggle button */'+
		'a.json-toggle {'+
		  'position: relative;'+
		  'color: inherit;'+
		  'text-decoration: none;'+
		'}'+
		'a.json-toggle:focus {'+
		  'outline: none;'+
		'}'+
		'a.json-toggle:before {'+
		  'color: #aaa;'+
		  'content: "\\25BC"; /* down arrow */'+
		  'position: absolute;'+
		  'display: inline-block;'+
		  'width: 1em;'+
		  'left: -1em;'+
		'}'+
		'a.json-toggle.collapsed:before {'+
		  'content: "\\25B6"; /* left arrow */'+
		'}'+
		''+
		'/* Collapsable placeholder links */'+
		'a.json-placeholder {'+
		  'color: #aaa;'+
		  'padding: 0 1em;'+
		  'text-decoration: none;'+
		'}'+
		'a.json-placeholder:hover {'+
		  'text-decoration: underline;'+
		'}'+
		'pre { padding: 0.5em 1.5em; }' +
		'</style>';

		w.document.body.appendChild(p);

		w.document.body.appendChild(document.createElement("hr"));

		var collapseAll = document.createElement("button");
		collapseAll.innerHTML = "Collapse to level 1";
		collapseAll.setAttribute("type", "button");
		collapseAll.style.display = "inline-block";
		collapseAll.addEventListener("click", function() {
			$(jsonPre).jsonViewer(data, {
				collapsed: true
			});

			$(jsonPre).find("a.json-placeholder:visible").first().click();
		});

		var expandAll = document.createElement("button");
		expandAll.innerHTML = "Expand all";
		expandAll.style.marginLeft = "10px";
		expandAll.setAttribute("type", "button");
		expandAll.style.display = "inline-block";
		expandAll.addEventListener("click", function() {
			$(jsonPre).jsonViewer(data, {
				collapsed: false
			});
		});

		var buttonCover = document.createElement("div");

		buttonCover.appendChild(collapseAll);
		buttonCover.appendChild(expandAll);

		w.document.body.appendChild(buttonCover);

		w.document.body.appendChild(jsonPre);
	}
});
