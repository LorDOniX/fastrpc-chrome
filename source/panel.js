var Panel = function() {
	this._const = {
		CUT_ARRAYS: 500,
		MAX_CLONE_VALUE_LVL: 100
	};
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
				item.every(function(itemX, ind) {
					this._formatCallParams([itemX], output, lvl + 1);

					// limit to 10 items at lvl 0
					if (ind > 10) {
						output.appendChild(document.createTextNode(",..."));
						return false;
					}
					else if (ind != item.length - 1) {
						output.appendChild(document.createTextNode(", "));
					}

					return true;
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
			request: true,
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
			values: ["FRPC", arrow, request.url, method, this._formatSize(data.content.size)]
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

Panel.prototype._cloneValue = function(value, lvl, info) {
	info = info || {
		collapse: false,
		collapseAt: 0,
		cutArrayLen: 0,
		cutArrays: []
	};

	lvl = lvl || 0;

	// recursive call threshold
	if (lvl > this._const.MAX_CLONE_VALUE_LVL) return null;

	switch (typeof value) {
		case "object":
			if (Array.isArray(value)) {
				// array
				var newArray = [];

				value.every(function(item, ind) {
					if (info.collapseAt && ind >= info.collapseAt) {
						info.collapse = true;
					}

					if (info.cutArrayLen && ind >= info.cutArrayLen) {
						info.cutArrays.push({
							array: newArray,
							len: value.length
						});
						return false;
					}

					newArray.push(this._cloneValue(item, lvl + 1, info));

					return true;
				}, this);

				return newArray;
			}
			else if (value && value instanceof Date) {
				// date
				return new Date(value.getTime());
			}
			else if (value) {
				// object
				var newObj = {};

				Object.keys(value).forEach(function(prop) {
					if (value.hasOwnProperty(prop)) {
						newObj[prop] = this._cloneValue(value[prop], lvl + 1, info);
					}
				}, this);

				return newObj;
			}
			else {
				// null
				return null;
			}

		case "undefined":
		case "boolean":
		case "function":
		case "number":
		case "string":
			return value;
	}
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
		var jsonViewer = new JSONViewer();
		var info = {
			collapse: false,
			collapseAt: 99,
			cutArrayLen: this._const.CUT_ARRAYS,
			cutArrays: []
		};
		var jsonData = this._cloneValue(data.data, 0, info);
		var collapsed = info.collapse;

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

		w.document.head.innerHTML = 
		'<meta charset="utf-8"><style>' +
		'html { width: 100%; height: 100%; overflow: hidden; }\n' +
		'body { font-size: 14px; height: 100%; overflow: scroll; }\n' +
		'.json-viewer {color: #000;padding-left: 20px;}\n'+
		'.json-viewer ul {list-style-type: none;margin: 0;margin: 0 0 0 1px;border-left: 1px dotted #ccc;padding-left: 2em;}\n'+
		'.json-viewer .hide {display: none;}\n'+
		'.json-viewer ul li .type-string, .json-viewer ul li .type-date {color: #0B7500;}\n'+
		'.json-viewer ul li .type-boolean {color: #1A01CC;font-weight: bold;}\n'+
		'.json-viewer ul li .type-number {color: #1A01CC;}\n'+
		'.json-viewer ul li .type-null {color: red;}\n'+
		'.json-viewer a.list-link {color: #000;text-decoration: none;position: relative;}\n'+
		'.json-viewer a.list-link:before {color: #aaa;content: "\\25BC";position: absolute;display: inline-block;width: 1em;left: -1em;}\n'+
		'.json-viewer a.list-link.collapsed:before {content: "\\25B6";top: -1px;}\n'+
		'.json-viewer a.list-link.empty:before {content: "";}\n'+
		'.json-viewer .items-ph {color: #aaa;padding: 0 1em;}\n'+
		'.json-viewer .items-ph:hover {text-decoration: underline;}\n'+
		'</style>';

		w.document.body.appendChild(p);
		w.document.body.appendChild(document.createElement("hr"));

		var collapseAll = document.createElement("button");
		collapseAll.innerHTML = "Collapse to level 1";
		collapseAll.classList.add("collapse-to-lvl1");
		collapseAll.setAttribute("type", "button");
		collapseAll.style.display = "inline-block";
		collapseAll.addEventListener("click", function() {
			jsonViewer.showJSON(jsonData, -1, 1, info.cutArrays);
		});

		var expandAll = document.createElement("button");
		expandAll.innerHTML = "Expand all";
		expandAll.style.marginLeft = "10px";
		expandAll.style.marginRight = "10px";
		expandAll.setAttribute("type", "button");
		expandAll.style.display = "inline-block";
		expandAll.addEventListener("click", function() {
			jsonViewer.showJSON(jsonData, undefined, undefined, info.cutArrays);
		});

		var buttonCover = document.createElement("div");
		buttonCover.appendChild(collapseAll);
		buttonCover.appendChild(expandAll);

		var copyResponseButton = document.createElement("button");
		copyResponseButton.innerHTML = "Copy response";
		copyResponseButton.style.marginRight = "10px";
		copyResponseButton.setAttribute("type", "button");
		copyResponseButton.style.display = "inline-block";
		copyResponseButton.addEventListener("click", function() {
			try {
				var copy = document.createElement("textarea");
				copy.value = JSON.stringify(data.data, null, "\t");
				copy.style.position = "absolute";
				copy.style.left = "-1000px";
				document.body.appendChild(copy);
				copy.select();
				successful = document.execCommand('copy');
			} catch (err) {
				alert("Response wasn't copy");
			}
		});

		buttonCover.appendChild(copyResponseButton);

		if (data.request) {
			var copyButton = document.createElement("button");
			copyButton.innerHTML = "Copy request";
			copyButton.style.marginRight = "10px";
			copyButton.setAttribute("type", "button");
			copyButton.style.display = "inline-block";
			copyButton.addEventListener("click", function() {
				try {
					var request = JSON.stringify(data.data, null, "\t");
					var copy = document.createElement("textarea");
					copy.value = data.method + "(" + request.substring(1,request.length-1) + ")";
					copy.style.position = "absolute";
					copy.style.left = "-1000px";
					document.body.appendChild(copy);
					copy.select();
					successful = document.execCommand('copy');
				} catch (err) {
					alert("Request wasn't copy");
				}
			});

			buttonCover.appendChild(copyButton);
		}

		if (info.cutArrays.length) {
			buttonCover.appendChild(document.createTextNode("Array length was reduced to " + info.cutArrayLen + " items only!"));
		}

		w.document.body.appendChild(buttonCover);
		w.document.body.appendChild(jsonViewer.getContainer());

		jsonViewer.showJSON(jsonData, undefined, undefined, info.cutArrays);

		var script = document.createElement("script");
		script.innerHTML = 
			'var title = document.createElement("title");\n' +
			'title.innerHTML = "{0}";\n'.replace("{0}", "FRPC Plugin: " + data.url) +
			'document.head.appendChild(title);\n'
		;

		w.document.body.appendChild(script);
	}
};

new Panel();
