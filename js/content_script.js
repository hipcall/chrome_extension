function convertLinks() {
    var elements = document.querySelectorAll("a[href^='tel:']")
    var itemsCount = elements.length;

    for (var i = 0; i < itemsCount; ++i) {
        elements[i].addEventListener("click", function(e) {
            e.preventDefault();
            var target = e.target.href.replace('tel:', '');
            try {
                chrome.runtime.sendMessage({
                    type: 'call',
                    call: target
                });
            } catch (err) {
                console.error("Error sending message:", err);
            }
        });
    }
}

window.addEventListener("load", function() {
    convertLinks()
}, false);

let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {
            if (addedNode.nodeType === Node.ELEMENT_NODE) {
                const nodes = addedNode.querySelectorAll("a[href^='tel:']");
                nodes.forEach((node) => {
                    node.addEventListener('click', (e) => {
                        e.preventDefault();
                        let phone = node.getAttribute('href').replace('tel:', '');
                        try {
                            chrome.runtime.sendMessage({
                                type: 'call',
                                call: phone
                            });
                        } catch (err) {
                            console.error("Error sending message:", err);
                        }
                    });
                });
            }
        }
    }
});

observer.observe(document, {
    attributes: false,
    childList: true,
    subtree: true
});