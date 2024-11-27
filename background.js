chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Comment Generator Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateComment") {
    // Handle any background tasks if needed
    sendResponse({ status: "success" });
  }
  return true;
});
