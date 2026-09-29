const network = chrome.devtools.network;
const BUFFER_LIMIT = 1000;
const buffered = [];
let panelWindow = null;

function onRequestFinished(har) {
	if (!panelWindow) {
		// the panel page is created lazily, on the first display; keep the requests until then
		buffered.push(har);
		if (buffered.length > BUFFER_LIMIT) { buffered.shift(); }
		return;
	}

	try {
		panelWindow.onNetworkRequest(har);
	} catch (e) {
		panelWindow = null;
	}
}

// registered before the panel exists, otherwise the first requests are lost
network && network.onRequestFinished && network.onRequestFinished.addListener(onRequestFinished);

// the buffer is not dropped on navigation - the event fires for History API url changes too and
// the panel itself drops what predates the load hook.js reports

// panel.js is a module, so its window callbacks may not be defined yet when the panel is shown
function handOff(shownWindow) {
	if (panelWindow) { return; }

	if (typeof shownWindow.onNetworkRequest != "function") {
		setTimeout(() => handOff(shownWindow), 20);
		return;
	}

	panelWindow = shownWindow;
	shownWindow.start(buffered.splice(0, buffered.length));
}

chrome.devtools.panels.create("FastRPC", "", "panel.html", function(panel) {
	panel.onShown.addListener(handOff);
});
