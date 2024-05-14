let webUrl = 'https://phone.hipcall.com.tr/#/'

class HipcallPopup {
    popup = null

    open(url = null) {
        if (!url) {
            url = webUrl
        }

        if (this.popup && this.popup.id) {
            chrome.windows.get(this.popup.id, {populate: true}, (window) => {
                // We have window just focus on.
                if (window && window.tabs[0]) {
                    chrome.windows.update(window.id, {focused: true})
                    chrome.tabs.update(window.tabs[0].id, {
                        url: url
                    })
                } else {
                    // Make popup null and run function again.
                    this.popup = null
                    this.open()
                }
            })
        } else {
            chrome.windows.create({
                url: webUrl,
                type: 'popup',
                height: 780,
                width: 400
            }, (window) => {
                this.popup = window
                chrome.windows.onRemoved.addListener((windowId) => {
                    if (window.id === windowId) {
                        chrome.notifications.create({
                            "type": "basic",
                            "iconUrl": 'icons/logo.png',
                            "title": 'Warning',
                            "message": 'Hipcall web phone window closed, be aware that you can\'t receive calls when popup window closed.'
                        });
                    }
                });
            });

        }
    }
}

let hipcallPopup = new HipcallPopup()

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === 'call') {
        hipcallPopup.open(`${webUrl}dial/${request.call}`)
    }
    if (request.type === 'ringing') {
        chrome.notifications.create({
            "type": "basic",
            "iconUrl": 'icons/logo.png',
            "title": 'Incoming call',
            "message": `${request.number} is calling click here to switch hipcall popup.`
        });
    }
});

chrome.action.onClicked.addListener(() => {
    hipcallPopup.open()
})

const MessageType = {
    PAGE_RENDERED: 'pageRendered'
};

chrome.webNavigation.onHistoryStateUpdated.addListener(details => {
    tabId = details.tabId;
    currentUrl = details.url;
    chrome.tabs.sendMessage(tabId, {type: MessageType.PAGE_RENDERED});
});

chrome.notifications.onClicked.addListener((callId) => {
    hipcallPopup.open(`${webUrl}ringing`)
})

