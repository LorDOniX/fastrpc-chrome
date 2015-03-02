var DATA = [];

var formatCallParams = function(data) {
	var arr = [];
	for (var i=0;i<data.length;i++) {
		var item = data[i];
		if (item === null) {
			arr.push("null");
		} else if (item instanceof Array) {
			arr.push("[...]");
		} else if (typeof(item) == "object") {
			arr.push("{...}")
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

var logRow = function() {
	var row = document.createElement("div");
	row.title = "Click to open in a window";
	for (var i=0;i<arguments.length;i++) {
		var item = arguments[i];
		if (!item.nodeType) {
			item = document.createTextNode(item);
		}
		row.appendChild(item);
		row.appendChild(document.createTextNode(" "));
	}
	document.querySelector("#log").appendChild(row);
	document.body.scrollTop = document.body.scrollHeight;
	return row;
}

var logRequest = function(data) {
	var arrow = formatArrow(0);
	try {
		var binary = JAK.Base64.atob(data.postData.text);
		var parsed = JAK.FRPC.parse(binary);

		var method = document.createElement("strong");
		method.innerHTML = parsed.method;

		var callParams = formatCallParams(parsed.params);
		logRow("FRPC", arrow, data.url, method, callParams);
		DATA.push(parsed.params);
	} catch (e) {
		logRow("FRPC", arrow, data.url, formatException(e));
		DATA.push(e);
	}
}

var logResponse = function(data, content, harEntry) {
	var arrow = formatArrow(1);
	try {
		var decoded = atob(content);
		var binary = JAK.Base64.atob(decoded);
		var parsed = JAK.FRPC.parse(binary);

		logRow("FRPC", arrow, harEntry.request.url, "|" , data.bodySize + " bytes");
		DATA.push(parsed);
	} catch (e) {
		logRow("FRPC", arrow, formatException(e));
		ERRORS.push(content)
		DATA.push(e);
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
	if (isFRPC(request.headers)) { logRequest(request); }

	var response = harEntry.response;
	if (isFRPC(response.headers)) { 
		harEntry.getContent(function(content) {
			logResponse(response, content, harEntry); 
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
	var row = null;
	while (target.parentNode) {
		if (target.parentNode.id == "log") { row = target; }
		target = target.parentNode;
	}
	if (!row) { return; }

	var all = document.querySelectorAll("#log > *");
	var index = -1;
	for (var i=0;i<all.length;i++) { 
		if (all[i] == row) { index = i; }
	}

	var data = DATA[index];
	var str = JSON.stringify(data, null, "  ");
	str = str.replace(/</g, "&lt;");

	var w = window.open();
	var jsonDataViewer = $(document.createElement("div"));
	jsonDataViewer.JSONView(JSON.parse(str));
	//w.document.body.innerHTML += "<pre>" + str + "</pre>";
	w.document.head.innerHTML = '<style>@charset "UTF-8";.jsonview {  font-family: monospace;  font-size: 1.5em;  white-space: pre-wrap; }  .jsonview .prop {    font-weight: bold; }  .jsonview .null {    color: red; }  .jsonview .bool {    color: blue; }  .jsonview .num {    color: blue; }  .jsonview .string {    color: green;    white-space: pre-wrap; }    .jsonview .string.multiline {      display: inline-block;      vertical-align: text-top; }  .jsonview .collapser {    position: absolute;    left: -1em;    cursor: pointer; }  .jsonview .collapsible {    transition: height 1.2s;    transition: width 1.2s; }  .jsonview .collapsible.collapsed {    height: .8em;    width: 1em;    display: inline-block;    overflow: hidden;    margin: 0; }  .jsonview .collapsible.collapsed:before {    content: "…";    width: 1em;    margin-left: .2em; }  .jsonview .collapser.collapsed {    transform: rotate(0deg); }  .jsonview .q {    display: inline-block;    width: 0px;    color: transparent; }  .jsonview li {    position: relative; }  .jsonview ul {    list-style: none;    margin: 0 0 0 2em;    padding: 0; }  .jsonview h1 {    font-size: 1.2em; }</style>';
	w.document.body.appendChild(jsonDataViewer[0]);
});
