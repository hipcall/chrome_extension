function convertLinks() {
    var elements = document.querySelectorAll("a[href^='tel:']")
    var itemsCount = elements.length;
    var config = {
        childList: true
    };

    for (var i = 0; i < itemsCount; ++i) {
        elements[i].addEventListener("click", function(e) {
            e.preventDefault();
            var target = e.target.href.replace('tel:', '');
            chrome.runtime.sendMessage({
                type: 'call',
                call: target
            });
        });
    }
}
window.addEventListener("message", (event) => {
    if (event.data.type === 'ringing') {
        chrome.runtime.sendMessage(event.data);
    }
}, false);

window.addEventListener("load", function() {
    convertLinks()
}, false);



let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {

            try {
                if (typeof addedNode === 'object' && addedNode !== null && 'querySelectorAll' in addedNode) {
                    const nodes = addedNode.querySelectorAll("a[href^='tel:']")
                    nodes.forEach((node) => {
                        node.addEventListener('click', (e) => {
                            e.preventDefault();
                            let phone = node.getAttributeNode('href').value.replace('tel:', '')
                            chrome.runtime.sendMessage({
                                type: 'call',
                                call: phone
                            });
                        })
                    })
                }

            } catch (err) {
                console.log(err)
            }
        }
    }
});
observer.observe(document, {
    attributes: true,
    childList: true,
    subtree: true
});