var Panel = function() {
	this._data = [];
	this._dom = {};
	this._dom.log = document.querySelector("#log");

	document.querySelector("#clear").addEventListener("click", this._clearClick.bind(this));
	this._dom.log.addEventListener("click", this._logClick.bind(this));

	chrome.devtools.network.onRequestFinished.addListener(this._processItem.bind(this));

	chrome.devtools.network.onNavigated.addListener(this._clearClick.bind(this));
};

Panel.prototype._formatCallParams = function(data, output, lvl) {
	lvl = lvl || 1;

	output = output || document.createElement("span");

	if (lvl == 1) {
		output.appendChild(document.createTextNode("("));
	}

	for (var i=0;i<data.length;i++) {
		var item = data[i];

		if (item === null) {
			output.appendChild(document.createTextNode("null"));
		}
		else if (item instanceof Array) {
			output.appendChild(document.createTextNode("["));
			
			if (lvl > 1) {
				output.appendChild(document.createTextNode("..."));
			}
			else {
				item.forEach(function(itemX, ind) {
					this._formatCallParams([itemX], output, lvl + 1);

					if (ind != item.length - 1) {
						output.appendChild(document.createTextNode(", "));
					}
				}, this);
			}

			output.appendChild(document.createTextNode("]"));
		}
		else if (typeof(item) == "object") {
			output.appendChild(document.createTextNode("{"));
			
			if (lvl > 1) {
				output.appendChild(document.createTextNode("..."));
			}
			else {
				var keys = Object.keys(item);

				keys.forEach(function(key, ind) {
					var itemX = item[key];

					if (typeof itemX === "string") {
						var node = document.createElement("span");
						node.innerHTML = '"' + key + '"';
						node.style.color = "#0B7500";
						output.appendChild(node);
					}
					else if (typeof itemX === "number" || typeof(itemX) == "boolean") {
						var node = document.createElement("span");
						node.innerHTML = key;
						if (typeof(item) == "boolean") {
							node.style.fontWeight = "bold";
						}
						node.style.color = "#1A01CC";
						output.appendChild(node);
					}
					else if (itemX instanceof Array) {
						output.appendChild(document.createTextNode(key + ": [...]"));
					}
					else if (typeof(itemX) == "object") {
						output.appendChild(document.createTextNode(key + ": {...}"));
					}
					else {
						output.appendChild(document.createTextNode(key));
					}

					if (ind != keys.length - 1) {
						output.appendChild(document.createTextNode(", "));
					}
				});
			}

			output.appendChild(document.createTextNode("}"));
		}
		else if (typeof item === "string") {
			var node = document.createElement("span");
			node.innerHTML = '"' + item + '"';
			node.style.color = "#0B7500";
			output.appendChild(node);
		}
		else if (typeof item === "number" || typeof(item) == "boolean") {
			var node = document.createElement("span");
			node.innerHTML = item;
			if (typeof(item) == "boolean") {
				node.style.fontWeight = "bold";
			}
			node.style.color = "#1A01CC";
			output.appendChild(node);
		}
		else {
			output.appendChild(document.createTextNode(item));
		}

		if (i != data.length - 1) {
			output.appendChild(document.createTextNode(", "));
		}
	}

	if (lvl == 1) {
		output.appendChild(document.createTextNode(")"));
	}

	return output;
};

Panel.prototype._formatException = function(e) {
	var result = document.createElement("strong");
	result.style.color = "red";
	result.innerHTML = e.message;
	return result;
};

Panel.prototype._formatArrow = function(type) {
	var node = document.createElement("strong");
	node.style.color = (type ? "green" : "blue");
	node.innerHTML = (type ? "←" : "→");
	return node;
};

// format size in bytes
Panel.prototype._formatSize = function(size) {
	if (typeof size !== "number") {
		return "null";
	}

	var lv = size > 0 ? Math.floor(Math.log(size) / Math.log(1024)) : 0;
	var sizes = ["", "K", "M", "G", "T"];

	lv = Math.min(sizes.length, lv);
	
	var value = lv > 0 ? (size / Math.pow(1024, lv)).toFixed(2) : size;

	return value + " " + sizes[lv] + "B";
};

Panel.prototype._isFRPC = function(headers) {
	for (var i=0;i<headers.length;i++) {
		var header = headers[i];
		if (header.name.toLowerCase() != "content-type") { continue; }
		if (header.value == "application/x-base64-frpc" || header.value == "application/x-frpc") { return header.value; }
	}

	return false;
};

Panel.prototype._processItem = function(harEntry) {
	var len = this._data.length;
	var responseRow;

	var request = harEntry.request;
	var requestHeader = this._isFRPC(request.headers);
	if (requestHeader) {
		// request, response
		this._data.push(null);
		this._data.push(null);

		var requestRow = document.createElement("div");
		requestRow.classList.add("log-line");
		requestRow.setAttribute("data-ind", len);

		responseRow = document.createElement("div");
		responseRow.innerHTML = "waiting for response...";
		responseRow.classList.add("log-line");
		responseRow.setAttribute("data-ind", len + 1);

		this._dom.log.appendChild(requestRow);
		this._dom.log.appendChild(responseRow);

		this._setRequest(requestRow, len, request, requestHeader);
	}

	var response = harEntry.response;
	var responseHeader = this._isFRPC(response.headers);
	if (responseHeader) { 
		harEntry.getContent(function(content) {
			this._setResponse(responseRow, len + 1, response, content, responseHeader);
		}.bind(this));
	}
};

Panel.prototype._setRequest = function(el, ind, data, header) {
	var arrow = this._formatArrow(0);
	var dataText = data.postData.text;
	var item;

	try {
		if (header.indexOf("base64") > -1) { dataText = atob(dataText); }
		var binary = dataText.split("").map(function(ch) { return ch.charCodeAt(0); })
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = parsed.method;

		var callParams = this._formatCallParams(parsed.params);

		item = {
			data: parsed.params,
			addBg: true,
			method: parsed.method,
			url: data.url,
			values: ["FRPC", arrow, data.url, method, callParams]
		};
	}
	catch (e) {
		item = {
			data: e,
			values: ["FRPC", arrow, this._formatException(e)]
		};
	}

	this._data[ind] = item;
	this._fillRow(el, item);
};

Panel.prototype._setResponse = function(el, ind, data, content, header) {
	var arrow = this._formatArrow(1);
	var item;

	try {
		var parsed = [];

		if (content) {
			var decoded = atob(content);
			if (header.indexOf("base64") > -1) { decoded = atob(decoded); }
			var binary = decoded.split("").map(function(ch) { return ch.charCodeAt(0); });
			parsed = JAK.FRPC.parse(binary);
		}

		var request = this._data[ind - 1];

		var method = document.createElement("strong");
		method.innerHTML = request.method;
		method.classList.add("response-method");

		item = {
			data: parsed,
			url: request.url,
			values: ["FRPC", arrow, request.url, method, this._formatSize(data.bodySize)]
		};
	}
	catch (e) {
		item = {
			data: e,
			values: ["FRPC", arrow, this._formatException(e)]
		};
	}

	this._data[ind] = item;
	this._fillRow(el, item);
};

Panel.prototype._fillRow = function(row, item) {
	row.innerHTML = "";

	item = item || {};

	if (item.addBg) {
		row.classList.add("add-bg");
	}

	var ar = [].concat(item.values || []);

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
};

Panel.prototype._clearClick = function() {
	this._data = [];
	this._dom.log.innerHTML = "";
};

Panel.prototype._logClick = function(e) {
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

	if (ind >= 0 && ind < this._data.length) {
		var data = this._data[ind];
		var w = window.open("about:blank", "");
		var jsonPre = document.createElement("pre");
		var jsonData = data.data;

		$(jsonPre).jsonViewer(jsonData, {
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
			$(jsonPre).jsonViewer(jsonData, {
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
			$(jsonPre).jsonViewer(jsonData, {
				collapsed: false
			});
		});

		var buttonCover = document.createElement("div");

		buttonCover.appendChild(collapseAll);
		buttonCover.appendChild(expandAll);

		w.document.body.appendChild(buttonCover);

		w.document.body.appendChild(jsonPre);

		var script = document.createElement("script");
		script.innerHTML = 'var title = document.createElement("title"); title.innerHTML = "{0}"; document.head.appendChild(title);'.replace("{0}", "FRPC Plugin: " + data.url);

		w.document.body.appendChild(script);
	}
};

new Panel();
