/*
	Routes entries captured in a page (relay.js) to the FastRPC panel opened
	over that very tab. Entries captured before the panel is opened are kept
	for a while, so that opening the panel later still shows recent calls.
*/
const BUFFER_LIMIT = 100;
const ports = new Map();
const buffered = new Map();

function flush(tabId, port) {
	let entries = buffered.get(tabId);

	buffered.delete(tabId);

	if (!entries) { return; }

	entries.forEach(entry => {
		try { port.postMessage(entry); } catch (e) {}
	});
}

chrome.runtime.onConnect.addListener(port => {
	if (port.name != "fastrpc-devtools") { return; }

	let tabId = null;

	port.onMessage.addListener(message => {
		if (message && message.type == "init" && typeof message.tabId == "number") {
			tabId = message.tabId;
			ports.set(tabId, port);
			flush(tabId, port);
		}
	});

	port.onDisconnect.addListener(() => {
		if (tabId !== null && ports.get(tabId) === port) { ports.delete(tabId); }
	});
});

chrome.runtime.onMessage.addListener((message, sender) => {
	if (!message || message.type != "fastrpc-entry") { return; }

	let tabId = sender.tab && sender.tab.id;

	if (typeof tabId != "number") { return; }

	let port = ports.get(tabId);

	if (port) {
		try {
			port.postMessage(message.entry);
			return;
		} catch (e) {
			ports.delete(tabId);
		}
	}

	let entries = buffered.get(tabId) || [];

	entries.push(message.entry);
	if (entries.length > BUFFER_LIMIT) { entries.shift(); }
	buffered.set(tabId, entries);
});

chrome.tabs.onRemoved.addListener(tabId => {
	ports.delete(tabId);
	buffered.delete(tabId);
});
