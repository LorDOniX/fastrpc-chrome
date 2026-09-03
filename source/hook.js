/*
	Runs in the MAIN world of the inspected page, before any page script.

	chrome.devtools.network.onRequestFinished does not see every request the page
	makes (out of process frames, sendBeacon, requests issued before the devtools
	page exists, ...). Wrapping fetch/XMLHttpRequest/sendBeacon here gives the panel
	a second source for those calls; duplicates are dropped on the panel side.
*/
(function() {
	if (window.__fastrpcHook) { return; }
	window.__fastrpcHook = true;

	const SOURCE = "fastrpc-hook";
	const MAX_BODY = 16 * 1024 * 1024;
	const xhrState = new WeakMap();
	const origFetch = window.fetch;
	const xhrProto = XMLHttpRequest.prototype;
	const origOpen = xhrProto.open;
	const origSend = xhrProto.send;
	const origSetRequestHeader = xhrProto.setRequestHeader;

	function stringToBytes(str) {
		for (let i = 0; i < str.length; i++) {
			// not a binary string, encode it properly
			if (str.charCodeAt(i) > 0xFF) { return new TextEncoder().encode(str); }
		}

		let bytes = new Uint8Array(str.length);
		for (let i = 0; i < str.length; i++) { bytes[i] = str.charCodeAt(i); }
		return bytes;
	}

	// 0xCA 0x11 is the FRPC magic, "yh" is how it starts once base64 encoded
	function hasMagic(bytes) {
		if (!bytes || bytes.length < 2) { return false; }
		return (bytes[0] == 0xCA && bytes[1] == 0x11) || (bytes[0] == 0x79 && bytes[1] == 0x68);
	}

	function looksFrpc(bytes, ct) {
		return (!!ct && /frpc/i.test(ct)) || hasMagic(bytes);
	}

	// synchronous pre-check, so that we do not buffer bodies of unrelated POSTs
	function maybeFrpc(body, ct) {
		if (ct && /frpc/i.test(ct)) { return true; }
		if (typeof body == "string") { return hasMagic(stringToBytes(body.slice(0, 2))); }
		if (body instanceof ArrayBuffer) { return hasMagic(new Uint8Array(body, 0, Math.min(2, body.byteLength))); }
		if (ArrayBuffer.isView(body)) { return hasMagic(new Uint8Array(body.buffer, body.byteOffset, Math.min(2, body.byteLength))); }
		if (body === null || body === undefined || body === "") { return false; }
		return true; // Blob/Request - content unknown until read
	}

	async function bodyBytes(body) {
		if (body === null || body === undefined || body === "") { return null; }
		if (typeof body == "string") { return stringToBytes(body); }
		if (body instanceof ArrayBuffer) { return new Uint8Array(body); }
		if (ArrayBuffer.isView(body)) { return new Uint8Array(body.buffer, body.byteOffset, body.byteLength); }
		if (typeof Blob != "undefined" && body instanceof Blob) { return new Uint8Array(await body.arrayBuffer()); }
		if (typeof URLSearchParams != "undefined" && body instanceof URLSearchParams) { return stringToBytes(body.toString()); }
		if (typeof Request != "undefined" && body instanceof Request) { return new Uint8Array(await body.arrayBuffer()); }
		return null; // FormData, ReadableStream, ...
	}

	function toBase64(bytes) {
		if (!bytes || bytes.length > MAX_BODY) { return null; }

		let str = "";
		for (let i = 0; i < bytes.length; i += 0x8000) {
			str += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
		}
		return btoa(str);
	}

	function absolute(url) {
		try { return new URL(url, location.href).href; } catch (e) { return String(url); }
	}

	function emit(entry) {
		try { window.postMessage({ source: SOURCE, entry }, "*"); } catch (e) {}
	}

	function headerLookup(headers, name) {
		if (!headers) { return ""; }

		try {
			if (typeof Headers != "undefined" && headers instanceof Headers) { return headers.get(name) || ""; }

			if (Array.isArray(headers)) {
				let hit = headers.find(pair => String(pair[0]).toLowerCase() == name);
				return hit ? String(hit[1]) : "";
			}

			let key = Object.keys(headers).find(item => item.toLowerCase() == name);
			return key ? String(headers[key]) : "";
		} catch (e) {
			return "";
		}
	}

	/* fetch */

	if (typeof origFetch == "function") {
		window.fetch = function(input, init) {
			let pending = null;

			try { pending = prepareFetch(input, init); } catch (e) { pending = null; }

			let result = origFetch.apply(this, arguments);

			if (pending) { finishFetch(pending, result); }

			return result;
		};
	}

	// the body has to be picked up before fetch() consumes it
	function prepareFetch(input, init) {
		let isRequest = (typeof Request != "undefined") && (input instanceof Request);
		let method = String((init && init.method) || (isRequest && input.method) || "GET").toUpperCase();

		if (method != "POST") { return null; }

		let ct = headerLookup(init && init.headers, "content-type") || (isRequest ? input.headers.get("content-type") : "") || "";
		let body = (init && "body" in init) ? init.body : null;

		if (body === null && isRequest) {
			if (input.bodyUsed) { return null; }
			body = input.clone();
		}

		if (!maybeFrpc(body, ct)) { return null; }

		return { url: absolute(isRequest ? input.url : input), method, ct, body, time: Date.now() };
	}

	function finishFetch(pending, result) {
		// attached before the caller's own handler, the response body is still untouched here
		let response = result.then(res => {
			try {
				return { status: res.status, ct: res.headers.get("content-type") || "", body: res.clone().arrayBuffer() };
			} catch (e) {
				return { status: res.status, ct: res.headers.get("content-type") || "", body: null };
			}
		}, () => null);

		(async () => {
			try {
				let bytes = await bodyBytes(pending.body);
				if (!looksFrpc(bytes, pending.ct)) { return; }

				let res = await response;
				if (!res) { return; }

				emit({
					url: pending.url,
					method: pending.method,
					requestType: pending.ct,
					request: toBase64(bytes),
					status: res.status,
					responseType: res.ct,
					response: res.body ? toBase64(new Uint8Array(await res.body)) : null,
					time: pending.time
				});
			} catch (e) {}
		})();
	}

	/* XMLHttpRequest */

	xhrProto.open = function(method, url) {
		try {
			xhrState.set(this, { method: String(method || "").toUpperCase(), url: absolute(url), ct: "" });
		} catch (e) {}

		return origOpen.apply(this, arguments);
	};

	xhrProto.setRequestHeader = function(name, value) {
		try {
			let state = xhrState.get(this);
			if (state && String(name).toLowerCase() == "content-type") { state.ct = String(value); }
		} catch (e) {}

		return origSetRequestHeader.apply(this, arguments);
	};

	xhrProto.send = function(body) {
		try { captureXhr(this, body); } catch (e) {}

		return origSend.apply(this, arguments);
	};

	function captureXhr(xhr, body) {
		let state = xhrState.get(xhr);

		if (!state || state.method != "POST" || !maybeFrpc(body, state.ct)) { return; }

		let time = Date.now();

		xhr.addEventListener("loadend", () => {
			(async () => {
				try {
					let bytes = await bodyBytes(body);
					if (!looksFrpc(bytes, state.ct)) { return; }

					emit({
						url: state.url,
						method: state.method,
						requestType: state.ct,
						request: toBase64(bytes),
						status: xhr.status,
						responseType: xhr.getResponseHeader("content-type") || "",
						response: toBase64(await xhrResponseBytes(xhr)),
						time
					});
				} catch (e) {}
			})();
		});
	}

	async function xhrResponseBytes(xhr) {
		let type = xhr.responseType;

		if (type == "arraybuffer") { return xhr.response ? new Uint8Array(xhr.response) : null; }
		if (type == "blob") { return xhr.response ? new Uint8Array(await xhr.response.arrayBuffer()) : null; }
		if (type == "" || type == "text") { return stringToBytes(xhr.responseText || ""); }

		return null; // json, document - already parsed, original bytes are gone
	}

	/* sendBeacon - the response is never available */

	if (navigator.sendBeacon) {
		let origBeacon = navigator.sendBeacon;

		navigator.sendBeacon = function(url, data) {
			try { captureBeacon(url, data); } catch (e) {}

			return origBeacon.apply(navigator, arguments);
		};
	}

	function captureBeacon(url, data) {
		let ct = (typeof Blob != "undefined" && data instanceof Blob) ? data.type : "";

		if (!maybeFrpc(data, ct)) { return; }

		let time = Date.now();

		(async () => {
			try {
				let bytes = await bodyBytes(data);
				if (!looksFrpc(bytes, ct)) { return; }

				emit({
					url: absolute(url),
					method: "POST",
					requestType: ct,
					request: toBase64(bytes),
					status: 0,
					responseType: "",
					response: null,
					time
				});
			} catch (e) {}
		})();
	}
})();
