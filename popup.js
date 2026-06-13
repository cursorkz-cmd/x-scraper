// Popup JS Script for X-Post Scraper

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const profileBadge = document.getElementById("profile-badge");
  const detectedProfile = document.getElementById("detected-profile");
  
  const activePanel = document.getElementById("active-panel");
  const fallbackPanel = document.getElementById("fallback-panel");
  
  const limitSelect = document.getElementById("limit-select");
  const speedSelect = document.getElementById("speed-select");
  const limitVal = document.getElementById("limit-val");
  const speedVal = document.getElementById("speed-val");
  
  const liveStats = document.getElementById("live-stats");
  const liveCount = document.getElementById("live-count");
  const progressBar = document.getElementById("progress-bar");
  
  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");
  const btnOpenX = document.getElementById("btn-open-x");
  const btnDashboard = document.getElementById("btn-dashboard");

  let activeTabId = null;

  // Initialize and check current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    activeTabId = tab.id;
    const url = tab.url || "";
    
    // Check if on X/Twitter
    const isX = url.includes("x.com") || url.includes("twitter.com");
    
    if (isX) {
      fallbackPanel.classList.add("hidden");
      activePanel.classList.remove("hidden");
      
      // Update UI configuration labels on change
      limitSelect.addEventListener("change", () => {
        limitVal.innerText = limitSelect.value === "0" ? "Unlimited" : limitSelect.value;
      });
      speedSelect.addEventListener("change", () => {
        const seconds = parseInt(speedSelect.value) / 1000;
        speedVal.innerText = `${seconds}s`;
      });
      
      // Initialize status query
      queryScraperStatus();
    } else {
      activePanel.classList.add("hidden");
      fallbackPanel.classList.remove("hidden");
      updateStatus("error", "Not on X.com");
    }
  });

  // Query content script for scraping status
  function queryScraperStatus() {
    updateStatus("idle", "Ready to scrape");
    
    chrome.tabs.sendMessage(activeTabId, { action: "GET_STATUS" }, (response) => {
      // If response is undefined, content script is not loaded (extension newly installed/updated)
      if (chrome.runtime.lastError || !response) {
        // Try programmatically injecting content script
        injectContentScript();
        return;
      }
      
      handleStatusResponse(response);
    });
  }

  // Inject content script programmatically if needed
  function injectContentScript() {
    updateStatus("idle", "Connecting to tab...");
    
    chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["content.js"]
    }, () => {
      if (chrome.runtime.lastError) {
        updateStatus("error", "Refresh X tab to connect");
        btnStart.disabled = true;
        btnStart.style.opacity = "0.5";
        return;
      }
      
      // Retry query status after injection
      setTimeout(() => {
        chrome.tabs.sendMessage(activeTabId, { action: "GET_STATUS" }, (response) => {
          if (chrome.runtime.lastError) {
            updateStatus("error", "Failed to link. Reload tab.");
            return;
          }
          if (response) {
            handleStatusResponse(response);
          } else {
            updateStatus("error", "Failed to link. Reload tab.");
          }
        });
      }, 300);
    });
  }

  // Handle scraping status details
  function handleStatusResponse(response) {
    // 1. Detect if on user profile
    if (response.profile) {
      profileBadge.classList.remove("hidden");
      detectedProfile.innerText = response.profile.handle;
      updateStatus(response.isScraping ? "active" : "idle", `Profile: ${response.profile.handle}`);
    } else {
      profileBadge.classList.add("hidden");
      updateStatus(response.isScraping ? "active" : "idle", response.isScraping ? "Scraping posts..." : "Ready to scrape");
    }
    
    // 2. Adjust panel components depending on active scraping
    if (response.isScraping) {
      setScrapingUI(true);
      updateLiveStats(response.count);
    } else {
      setScrapingUI(false);
    }
  }

  // Set UI state to Scraping or Idle
  function setScrapingUI(isScraping) {
    if (isScraping) {
      btnStart.classList.add("hidden");
      btnStop.classList.remove("hidden");
      btnStop.disabled = false;
      
      limitSelect.disabled = true;
      speedSelect.disabled = true;
      
      liveStats.classList.remove("hidden");
    } else {
      btnStart.classList.remove("hidden");
      btnStop.classList.add("hidden");
      btnStop.disabled = true;
      
      limitSelect.disabled = false;
      speedSelect.disabled = false;
      
      liveStats.classList.add("hidden");
    }
  }

  // Update status card indicator
  function updateStatus(type, msg) {
    statusDot.className = "indicator-dot " + type;
    statusText.innerText = msg;
  }

  // Update live statistics meter
  function updateLiveStats(count) {
    liveCount.innerText = count.toLocaleString();
    
    const limit = parseInt(limitSelect.value);
    if (limit > 0) {
      const percentage = Math.min(100, (count / limit) * 100);
      progressBar.style.width = `${percentage}%`;
    } else {
      progressBar.style.width = "100%"; // Glow solid for unlimited
    }
  }

  // Button Listeners
  btnStart.addEventListener("click", () => {
    const limit = parseInt(limitSelect.value);
    const delay = parseInt(speedSelect.value);
    
    updateStatus("active", "Initiating scraper...");
    
    chrome.tabs.sendMessage(activeTabId, { 
      action: "START_SCRAPING", 
      limit: limit, 
      delay: delay 
    }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus("error", "Failed to start: tab disconnected");
        return;
      }
      if (response && response.status === "STARTED") {
        setScrapingUI(true);
        updateLiveStats(0);
        updateStatus("active", "Scraping posts...");
      } else {
        updateStatus("error", "Error starting scraper");
      }
    });
  });

  btnStop.addEventListener("click", () => {
    updateStatus("idle", "Halting operations...");
    
    chrome.tabs.sendMessage(activeTabId, { action: "STOP_SCRAPING" }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus("error", "Failed to stop: tab disconnected");
        return;
      }
      if (response && response.status === "STOPPED") {
        setScrapingUI(false);
        updateStatus("idle", `Scraping halted. Scraped ${response.count}`);
      }
    });
  });

  btnOpenX.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://x.com" });
  });

  btnDashboard.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Listen to background script for session updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "TWEETS_SAVED") {
      // Dynamic count-up feedback
      chrome.tabs.sendMessage(activeTabId, { action: "GET_STATUS" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.isScraping) {
          updateLiveStats(response.count);
        }
      });
    } else if (message.action === "SCRAPE_FINISHED") {
      setScrapingUI(false);
      updateStatus("idle", `Complete! Saved ${message.count} posts.`);
      // Bring attention to the dashboard
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 1000);
    } else if (message.action === "UPDATE_STATUS" && message.tabId === activeTabId) {
      updateLiveStats(message.data.scrapedCount);
    }
  });
});
