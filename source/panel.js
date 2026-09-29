import * as fastrpc from "./fastrpc.js";

const ext = (window.browser ? browser : chrome);
const devtools = ext.devtools;
const CUT_ARRAYS = 500;
const MAX_CLONE_VALUE_LVL = 100;
const FRPC_CONTENT_TYPE = /-frpc/i;
const TYPE_CALL = 13;
const dom = {
	clear: document.querySelector("#clear"),
	header: document.querySelector("#header"),
	log: document.querySelector("#log"),
	filterType: document.querySelector("#filter-type"),
	filterText: document.querySelector("#filter-text"),
};

dom.clear.addEventListener("click", e => {
	dom.log.innerHTML = "";
});

/*
	Filtering hides the lines instead of dropping them, so that loosening the filter brings
	them back without the requests having to be decoded again. Every line carries its own
	text (url, method, params, response), the response line included - the method is in it
	as well, only hidden by the stylesheet, so both lines of a call match the same query.
*/
let filterType = "";
let filterText = "";

function lineMatches(row) {
	if (filterType && !row.classList.contains(filterType)) { return false; }
	if (!filterText) { return true; }

	return (row.dataset.text || "").indexOf(filterText) != -1;
}

function applyFilter(row) {
	row.classList.toggle("filtered-out", !lineMatches(row));
}

function applyFilters() {
	dom.log.querySelectorAll(".log-line").forEach(applyFilter);
}

dom.filterType.addEventListener("change", e => {
	filterType = dom.filterType.value;
	applyFilters();
});

function onFilterText() {
	filterText = dom.filterText.value.trim().toLowerCase();
	applyFilters();
}

dom.filterText.addEventListener("input", onFilterText);
// the native clear button of a search input reports the emptied value as a search event
dom.filterText.addEventListener("search", onFilterText);

async function getContent(har) {
	let ffPromise;
	let chromePromise = new Promise(resolve => {
		ffPromise = har.getContent((content, encoding) => resolve([content, encoding]));
	});

	let [content, encoding] = await (ffPromise || chromePromise);
	return atob(content);
}

function headerValue(headers, name) {
	let hit = (headers || []).find(header => header.name && header.name.toLowerCase() == name);
	return hit ? hit.value : "";
}

function requestContentType(request) {
	return (request.postData && request.postData.mimeType) || headerValue(request.headers, "content-type") || "";
}

function responseContentType(response) {
	return (response.content && response.content.mimeType) || headerValue(response.headers, "content-type") || "";
}

function stringToBytes(str) {
	let bytes = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) { bytes[i] = str.charCodeAt(i) & 0xFF; }
	return bytes;
}

function hasMagic(bytes) {
	return !!bytes && bytes.length > 1 && bytes[0] == 0xCA && bytes[1] == 0x11;
}

/*
	The payload is either raw FRPC or base64 encoded FRPC. The content type is not
	reliable (custom types, missing header), so the magic bytes decide.
*/
function frpcBytes(text, ct) {
	if (!text) { return null; }

	let raw = stringToBytes(text);
	if (hasMagic(raw)) { return raw; }

	let decoded = null;
	try { decoded = stringToBytes(atob(text.replace(/\s/g, ""))); } catch (e) {}
	if (hasMagic(decoded)) { return decoded; }

	return (ct && /base64/i.test(ct)) ? decoded : raw;
}

// cheap check, so that bodies of unrelated POSTs are not base64 decoded
function maybeFrpc(text, ct) {
	if (ct && FRPC_CONTENT_TYPE.test(ct)) { return true; }
	if (!text || text.length < 2) { return false; }
	if (text.slice(0, 2) == "yh") { return true; }		// base64 encoded magic

	let first = text.charCodeAt(0);
	return first == 0xCA || first == 0xFFFD;			// raw magic, possibly mangled by the HAR text decoding
}

// method name straight from the bytes, without parsing the whole call
function frpcCallName(bytes) {
	if (!bytes || bytes.length < 6 || (bytes[4] >> 3) != TYPE_CALL) { return ""; }

	let length = Math.min(bytes[5], bytes.length - 6);
	let name = "";
	for (let i = 0; i < length; i++) { name += String.fromCharCode(bytes[6 + i]); }
	return name;
}

function requestBytes(har) {
	if (!("__requestBytes" in har)) {
		let text = har.request.postData && har.request.postData.text;
		let ct = requestContentType(har.request);
		har.__requestBytes = maybeFrpc(text, ct) ? frpcBytes(text, ct) : null;
	}

	return har.__requestBytes;
}

function formatException(e) {
	var result = document.createElement("strong");
	result.style.color = "red";
	result.innerHTML = e.message;
	return result;
}

function formatArrow(type) {
	var node = document.createElement("strong");
	node.style.color = (type ? "green" : "blue");
	node.innerHTML = (type ? "←" : "→");
	return node;
}

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
}

function copyText(text) {
	//Create a textbox field where we can insert text to.
	var copyFrom = document.createElement("textarea");

	//Set the text content to be the text you wished to copy.
	copyFrom.textContent = text;

	//Append the textbox field into the body as a child.
	//"execCommand()" only works when there exists selected text, and the text is inside
	//document.body (meaning the text is part of a valid rendered HTML element).
	document.body.appendChild(copyFrom);

	//Select all the text!
	copyFrom.select();

	//Execute command
	document.execCommand('copy');

	//(Optional) De-select the text using blur().
	copyFrom.blur();

	//Remove the textbox field from the document.body, so no other JavaScript nor
	//other elements can get access to this.
	document.body.removeChild(copyFrom);
}

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

function buildLine(har) {
	let started = harStarted(har);
	let requestRow = document.createElement("div");
	requestRow.classList.add("log-line", "request");
	let responseRow = document.createElement("div");
	responseRow.classList.add("log-line", "response");

	// the load marker of the displayed document may arrive later, the lines have to be datable
	requestRow.dataset.started = started;
	responseRow.dataset.started = started;

	dom.log.appendChild(requestRow);
	dom.log.appendChild(responseRow);

	// still empty, a text filter hides them until fillRow knows what they contain
	applyFilter(requestRow);
	applyFilter(responseRow);

	let requestData = buildRequest(requestRow, har);
	buildResponse(responseRow, har, requestData);
}

function buildRequest(row, har) {
	let request = har.request;
	let item;
	let requestData = {
		method: "",
		url: ""
	};
	let arrow = formatArrow(0);
	let bytes = requestBytes(har);

	if (bytes) {
		try {
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
				data: {
					error: e.message,
					url: request.url,
					data: request.postData && request.postData.text
				},
				values: ["FRPC", arrow, request.url, formatException(e)]
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

async function buildResponse(row, har, requestData) {
	let response = har.response;
	let item;
	let arrow = formatArrow(1);
	let ct = responseContentType(response);

	if (response.status && response.status != 200) { row.classList.add("error"); } // non-200 http

	// the body was captured in the page, but the response is not observable there
	if (har.__responseText === null) {
		fillRow(row, {
			data: "(response not captured)",
			url: requestData.url,
			values: ["FRPC", arrow, requestData.url, "(response not captured)"]
		});
		return;
	}

	let content = ("__responseText" in har) ? har.__responseText : await getContent(har);
	let bytes = frpcBytes(content, ct);

	if (hasMagic(bytes) || FRPC_CONTENT_TYPE.test(ct)) {
		try {
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
				data: {
					error: e.message,
					data: content,
					url: requestData.url
				},
				values: ["FRPC", arrow, requestData.url, formatException(e)]
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

	row.dataset.text = row.textContent.toLowerCase();
	applyFilter(row);

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

		var collapseLvl = document.createElement("input");
		collapseLvl.value = "1";
		collapseLvl.style.width = "50px";

		var collapseAll = document.createElement("button");
		collapseAll.innerHTML = "Collapse to level";
		collapseAll.classList.add("collapse-to-lvl1");
		collapseAll.setAttribute("type", "button");
		collapseAll.addEventListener("click", function() {
			jsonViewer.showJSON(jsonData, -1, Math.max(parseInt(collapseLvl.value), 0), info.cutArrays);
		});

		var expandAll = document.createElement("button");
		expandAll.innerHTML = "Expand all";
		expandAll.setAttribute("type", "button");
		expandAll.addEventListener("click", function() {
			jsonViewer.showJSON(jsonData, undefined, undefined, info.cutArrays);
		});

		var buttonCover = document.createElement("div");

		buttonCover.style.display = "flex";
		buttonCover.style.flexDirection = "row";
		buttonCover.style.gap = "10px";
		buttonCover.style.alignContent = "center";
		buttonCover.appendChild(collapseAll);
		buttonCover.appendChild(collapseLvl);
		buttonCover.appendChild(expandAll);

		var copyButton = document.createElement("button");
		copyButton.innerHTML = item.request ? "Copy request" : "Copy response";
		copyButton.style.marginRight = "10px";
		copyButton.setAttribute("type", "button");
		copyButton.style.display = "inline-block";
		copyButton.addEventListener("click", function() {
			var value;

			if (item.request) {
				value = JSON.stringify(item.data);
				value = item.method + "(" + value.substring(1, value.length - 1) + ")";
			} else {
				value = JSON.stringify(item.data, null, "\t");
			}

			copyText(value);
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

const HOOK_DELAY = 1200;
const DEDUP_WINDOW = 8000;
const networkKeys = [];
// bumped on every page load, so that entries held for the dedup delay can be recognised as stale
let pageEpoch = 0;
// identity of the load hook.js reported last, the panel may learn about it long after it happened
let lastLoad = null;
// when the displayed document started, calls older than that were made by the page before it
let pageLoadedAt = 0;

// identifies one call well enough to recognise it coming from both sources
function harKey(har) {
	let bytes = requestBytes(har);
	return [har.request.method || "POST", har.request.url, frpcCallName(bytes), bytes ? bytes.length : 0].join("|");
}

function pruneKeys(now) {
	while (networkKeys.length && now - networkKeys[0].time > DEDUP_WINDOW) { networkKeys.shift(); }
}

function noteNetworkEntry(key) {
	let now = Date.now();
	pruneKeys(now);
	networkKeys.push({ key, time: now, claimed: false });
}

// true when devtools.network already logged the very same call
function claimNetworkEntry(key, time) {
	pruneKeys(Date.now());

	let hit = networkKeys.find(item => !item.claimed && item.key == key && Math.abs(item.time - time) < DEDUP_WINDOW);
	if (hit) { hit.claimed = true; }

	return !!hit;
}

function isFrpcHar(har) {
	if (requestBytes(har)) { return true; }

	return FRPC_CONTENT_TYPE.test(requestContentType(har.request)) || FRPC_CONTENT_TYPE.test(responseContentType(har.response));
}

function onRequestFinished(har) {
	if (!isFrpcHar(har)) { return; }
	if (fromPreviousPage(har)) { return; }

	noteNetworkEntry(harKey(har));
	buildLine(har);
}

/* requests captured in the page itself (hook.js), for calls devtools.network never reports */

function hookToHar(entry) {
	let requestText = entry.request ? atob(entry.request) : "";
	let responseText = entry.response ? atob(entry.response) : null;

	return {
		__hook: true,
		__time: entry.time || 0,
		__responseText: responseText,
		request: {
			url: entry.url,
			method: entry.method || "POST",
			headers: [{ name: "Content-Type", value: entry.requestType || "" }],
			postData: { mimeType: entry.requestType || "", text: requestText }
		},
		response: {
			status: entry.status || 0,
			headers: [{ name: "Content-Type", value: entry.responseType || "" }],
			content: { mimeType: entry.responseType || "", size: responseText ? responseText.length : 0 }
		}
	};
}

function onHookEntry(entry) {
	if (!entry) { return; }

	// hook.js reports the load of every top level document
	if (entry.load) {
		onPageLoad(entry);
		return;
	}

	let har = hookToHar(entry);

	if (!isFrpcHar(har)) { return; }
	if (fromPreviousPage(har)) { return; }

	let key = harKey(har);
	// the page clock is not the devtools clock, compare the moments both sources delivered
	let time = Date.now();
	let epoch = pageEpoch;

	// devtools.network reports the same call a moment later, give it a chance first
	setTimeout(() => {
		if (epoch != pageEpoch) { return; }	// the page was loaded again in the meantime
		if (claimNetworkEntry(key, time)) { return; }
		buildLine(har);
	}, HOOK_DELAY);
}

/* page loads - only a new document clears the list, an url change made by the page does not */

// the moment the call was made; the page clock and the devtools clock are the same wall clock
function harStarted(har) {
	if ("__time" in har) { return har.__time; }

	let started = Date.parse(har.startedDateTime || "");
	return isNaN(started) ? 0 : started;
}

// both sources keep reporting calls of the document that has already been left behind
function fromPreviousPage(har) {
	let started = harStarted(har);

	return !!pageLoadedAt && !!started && started < pageLoadedAt;
}

function dropPreviousPage() {
	if (!pageLoadedAt) { return; }

	dom.log.querySelectorAll(".log-line").forEach(row => {
		let started = Number(row.dataset.started);
		if (started && started < pageLoadedAt) { row.remove(); }
	});
}

/*
	hook.js reports the start of every top level document, the History API url changes of a
	single page application among them are not reported at all - those must keep the list.

	The marker of the page currently displayed can arrive at any time, it waits in the service
	worker until the panel connects, which may be long after the calls of that very page were
	listed. Such a first marker only tells which calls are older than the displayed document,
	a load the panel lived through wipes everything.
*/
function onPageLoad(entry) {
	let load = (entry.url || "") + "|" + (entry.time || 0);

	if (load == lastLoad) { return; }

	let known = (lastLoad !== null);

	lastLoad = load;
	pageLoadedAt = entry.time || 0;

	if (known) {
		clearLines();
		return;
	}

	dropPreviousPage();
}

function connectHook() {
	let port;

	try {
		port = ext.runtime.connect({ name: "fastrpc-devtools" });
	} catch (e) {
		return;
	}

	port.onMessage.addListener(onHookEntry);
	// the background service worker may be shut down at any time
	port.onDisconnect.addListener(() => setTimeout(connectHook, 1000));
	port.postMessage({ type: "init", tabId: devtools.inspectedWindow.tabId });
}

function clearLines() {
	pageEpoch++;
	dom.log.innerHTML = "";
	networkKeys.length = 0;
}

// devtools.js owns the network listener and forwards everything here
window.onNetworkRequest = onRequestFinished;

window.start = function(finished) {
	finished.forEach(har => onRequestFinished(har));
};

/*
	devtools.network.onNavigated is deliberately not used - it fires for History API url
	changes as well, which would wipe the calls of a single page application that never
	left its document. The load marker of hook.js is the only clearing signal.
*/
devtools.panels.onThemeChanged && devtools.panels.onThemeChanged.addListener(syncTheme);
syncTheme();
connectHook();
