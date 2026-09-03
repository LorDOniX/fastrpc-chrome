/*
	Isolated world part of the page hook - moves the entries collected by hook.js
	to the background service worker, which routes them to the devtools panel.
*/
window.addEventListener("message", event => {
	if (event.source !== window) { return; }

	let data = event.data;

	if (!data || data.source != "fastrpc-hook" || !data.entry) { return; }

	try {
		chrome.runtime.sendMessage({ type: "fastrpc-entry", entry: data.entry }, () => chrome.runtime.lastError);
	} catch (e) {
		// extension was reloaded, nothing to deliver to
	}
});
