import * as fastrpc from "./fastrpc.js";

const devtools = (window.browser ? browser : chrome).devtools;
const tbody = document.querySelector("tbody");
const CUT_ARRAYS = 500;
const MAX_CLONE_VALUE_LVL = 100;
const dom = {
	clear: document.querySelector("#clear"),
	log: document.querySelector("#log")
}

function isFrpc(ct) { return ct && ct.match(/-frpc/i); }

dom.clear.addEventListener("click", e => {
	dom.log.innerHTML = "";
});

async function getContent(har) {
	let ffPromise;
	let chromePromise = new Promise(resolve => {
		ffPromise = har.getContent((content, encoding) => resolve([content, encoding]));
	});

	let [content, encoding] = await (ffPromise || chromePromise);
	return atob(content);
}

function stringToBytes(str, ct) {
	if (ct.match(/base64/i)) {
		return atob(str).split("").map(x => x.charCodeAt(0));
	} else {
		let bytes = new Uint8Array(str.length);
		return str.split("").map(x => x.charCodeAt(0));
	}
}


function formatException(e) {
	var result = document.createElement("strong");
	result.style.color = "red";
	result.innerHTML = e.message;
	return result;
};

function formatArrow(type) {
	var node = document.createElement("strong");
	node.style.color = (type ? "green" : "blue");
	node.innerHTML = (type ? "←" : "→");
	return node;
};


// format size in bytes
function formatSize(size) {
	if (typeof size !== "number") {
		return "null";
	}

	var lv = size > 0 ? Math.floor(Math.log(size) / Math.log(1024)) : 0;
	var sizes = ["", "K", "M", "G", "T"];

	lv = Math.min(sizes.length, lv);
	
	var value = lv > 0 ? (size / Math.pow(1024, lv)).toFixed(2) : size;

	return value + " " + sizes[lv] + "B";
};

function formatCallParams(data, output, lvl) {
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
				item.every((itemX, ind) => {
					formatCallParams([itemX], output, lvl + 1);

					// limit to 10 items at lvl 0
					if (ind > 10) {
						output.appendChild(document.createTextNode(",..."));
						return false;
					}
					else if (ind != item.length - 1) {
						output.appendChild(document.createTextNode(", "));
					}

					return true;
				});
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

function cloneValue(value, lvl, info) {
	info = info || {
		collapse: false,
		collapseAt: 0,
		cutArrayLen: 0,
		cutArrays: []
	};

	lvl = lvl || 0;

	// recursive call threshold
	if (lvl > MAX_CLONE_VALUE_LVL) return null;

	switch (typeof value) {
		case "object":
			if (Array.isArray(value)) {
				// array
				let newArray = [];
				value.every((item, ind) => {
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

					newArray.push(cloneValue(item, lvl + 1, info));

					return true;
				});

				return newArray;
			}
			else if (value && value instanceof Date) {
				// date
				return new Date(value.getTime());
			}
			else if (value) {
				// object
				let newObj = {};
				Object.keys(value).forEach(prop => {
					if (value.hasOwnProperty(prop)) {
						newObj[prop] = cloneValue(value[prop], lvl + 1, info);
					}
				});

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
}

function syncTheme() {
	document.body.dataset.theme = devtools.panels.themeName;
}

function buildRow(har) {
	let requestRow = document.createElement("div");
	requestRow.classList.add("log-line");
	let responseRow = document.createElement("div");
	responseRow.classList.add("log-line");

	dom.log.appendChild(requestRow);
	dom.log.appendChild(responseRow);

	let requestData = buildRequest(requestRow, har.request);
	buildResponse(responseRow, har.response, har, requestData);
}

function buildRequest(row, request) {
	let item;
	let requestData = {
		method: "",
		url: ""
	};
	let arrow = formatArrow(0);

	if (request.postData && isFrpc(request.postData.mimeType)) {
		try {
			let bytes = stringToBytes(request.postData.text, request.postData.mimeType);
			let data = fastrpc.parse(bytes);
			if (data.method == "system.multicall") { data.params = data.params[0]; }
			requestData.method = data.method;
			requestData.url = request.url;
			let callParams = formatCallParams(data.params);
			let method = document.createElement("strong");
			method.innerHTML = data.method;
			item = {
				data: data.params,
				addBg: true,
				method: data.method,
				url: request.url,
				request: true,
				values: ["FRPC", arrow, request.url, method, callParams]
			};
		} catch (e) {
			item = {
				data: e.message,
				values: ["FRPC", arrow, formatException(e)]
			};
		}
	} else {
		item = {
			data: "(not a FastRPC request)",
			values: ["FRPC", arrow, "(not a FastRPC request)"]
		};
	}

	fillRow(row, item);
	return requestData;
}

async function buildResponse(row, response, har, requestData) {
	let item;
	let arrow = formatArrow(1);

	if (response.status != 200) { row.classList.add("error"); } // non-200 http

	if (isFrpc(response.content.mimeType)) {
		let content = await getContent(har);
		try {
			let bytes = stringToBytes(content, response.content.mimeType);
			let data = fastrpc.parse(bytes);
			let str;
			if (data instanceof Array) {
				if (data.some(x => x.status != 200)) { row.classList.add("error"); } // non-200 frpc multicall
				str = data.map(x => x.status).join("/");
			} else {
				if (data.status != 200) { row.classList.add("error"); } // non-200 frpc singlecall
				str = data.status;
			}
			let method = document.createElement("strong");
			method.innerHTML = requestData.method;
			method.classList.add("response-method");
			item = {
				data,
				url: requestData.url,
				values: ["FRPC", arrow, requestData.url, method, formatSize(bytes.length)]
			};
		} catch (e) {
			item = {
				data: e.message,
				values: ["FRPC", arrow, formatException(e)]
			};
		}
	} else {
		item = {
			data: "(not a FastRPC request)",
			values: ["FRPC", arrow, "(not a FastRPC request)"]
		};
	}

	fillRow(row, item);
}

function fillRow(row, item) {
	item = item || {};

	if (item.addBg) {
		row.classList.add("add-bg");
	}

	[].concat(item.values || []).forEach(itemVal => {
		let rowEl;

		if (!itemVal.nodeType) {
			rowEl = document.createTextNode(itemVal);
		}
		else {
			rowEl = itemVal.cloneNode(true);
		}

		row.appendChild(rowEl);
		row.appendChild(document.createTextNode(" "));
	});

	row.addEventListener("click", e => {
		var w = window.open("about:blank", "");
		var jsonViewer = new JSONViewer();
		var info = {
			collapse: false,
			collapseAt: 99,
			cutArrayLen: CUT_ARRAYS,
			cutArrays: []
		};
		var jsonData = cloneValue(item.data, 0, info);

		var p = document.createElement("p");
		p.style.fontSize = "20px";
		var pInfo = document.createElement("span");
		pInfo.innerHTML = "";
		p.appendChild(pInfo);

		item.values.forEach(function(i) {
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

		w.document.title = p.textContent;
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

		var copyButton = document.createElement("button");
		copyButton.innerHTML = item.request ? "Copy request" : "Copy response";
		copyButton.style.marginRight = "10px";
		copyButton.setAttribute("type", "button");
		copyButton.style.display = "inline-block";
		copyButton.addEventListener("click", function() {
			try {
				var value;

				if (item.request) {
					value = JSON.stringify(item.data);
					value = item.method + "(" + value.substring(1, value.length - 1) + ")";
				}
				else {
					value = JSON.stringify(item.data, null, "\t");
				}

				var copy = document.createElement("textarea");
				copy.value = value;
				copy.style.position = "absolute";
				copy.style.left = "-1000px";
				document.body.appendChild(copy);
				copy.select();
				document.execCommand('copy');
			} catch (err) {
				alert(err);
				alert(err.message);
				alert("Request/response wasn't copy");
			}
		});

		buttonCover.appendChild(copyButton);

		if (info.cutArrays.length) {
			buttonCover.appendChild(document.createTextNode("Array length was reduced to " + info.cutArrayLen + " items only!"));
		}

		w.document.body.appendChild(buttonCover);
		w.document.body.appendChild(jsonViewer.getContainer());

		jsonViewer.showJSON(jsonData, undefined, undefined, info.cutArrays);
	});
}

function onRequestFinished(har) {
	let { request, response } = har;

	request.headers.forEach(header => {
		if (header.name.match(/X-Seznam-hashId/i)) { hashId = header.value; }
	});

	let requestOk = (request.postData && isFrpc(request.postData.mimeType));
	let responseOk = isFrpc(response.content.mimeType);

	if (requestOk || responseOk) { buildRow(har); }
}

function onNavigated() {
	let rows = tbody.querySelectorAll("tr").length;
	if (rows > 0) {
		let empty = tbody.insertRow();
		empty.className = "empty";
		let td = empty.insertCell();
		td.colSpan = 5;
	}
}

devtools.network.onRequestFinished && devtools.network.onRequestFinished.addListener(onRequestFinished);
devtools.network.onNavigated && devtools.network.onNavigated.addListener(onNavigated);
devtools.panels.onThemeChanged && devtools.panels.onThemeChanged.addListener(syncTheme);
syncTheme();
