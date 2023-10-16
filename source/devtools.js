chrome.devtools.panels.create("FastRPC", "", "panel.html", function(panel) {
	const finished = [];

	function onRequestFinished(har) {
		finished.push(har);
	}

	chrome.devtools.network.onRequestFinished && chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);

	panel.onShown.addListener(function(panelWindow) {
		panelWindow.start(finished);
	});
});
