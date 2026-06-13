// Background Service Worker for X-Post Scraper

let activeScrapers = {}; // Tracks active scrape jobs by tabId

// Handle extension install/update
chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage databases if empty
  chrome.storage.local.get(["scraped_tweets", "scraped_profiles"], (result) => {
    if (!result.scraped_tweets) {
      chrome.storage.local.set({ scraped_tweets: [] });
    }
    if (!result.scraped_profiles) {
      chrome.storage.local.set({ scraped_profiles: {} });
    }
  });
  console.log("X-Post Scraper Service Worker Installed.");
});

// Orchestrate messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;
  
  if (message.action === "SCRAPE_STARTED") {
    activeScrapers[tabId] = {
      url: message.url,
      profile: message.profile,
      scrapedCount: 0,
      status: "RUNNING",
      startTime: new Date().toISOString()
    };
    // Broadcast status to extension popup
    broadcastToPopup({ action: "UPDATE_STATUS", tabId, data: activeScrapers[tabId] });
    sendResponse({ status: "ACK" });
  } 
  
  else if (message.action === "PROFILE_SCRAPED") {
    // Save or update profile in database
    const profile = message.profile;
    if (profile && profile.username) {
      chrome.storage.local.get("scraped_profiles", (result) => {
        const profiles = result.scraped_profiles || {};
        profiles[profile.username] = profile;
        chrome.storage.local.set({ scraped_profiles: profiles }, () => {
          console.log(`Saved profile info for @${profile.username}`);
          broadcastToPopup({ action: "PROFILE_UPDATED", profile });
        });
      });
    }
    sendResponse({ status: "ACK" });
  }
  
  else if (message.action === "TWEETS_SCRAPED") {
    const newTweets = message.tweets || [];
    
    // Read, merge, deduplicate, and write back
    chrome.storage.local.get("scraped_tweets", (result) => {
      const existingTweets = result.scraped_tweets || [];
      const existingMap = new Map(existingTweets.map(t => [t.id, t]));
      
      let addedCount = 0;
      newTweets.forEach(tweet => {
        if (!existingMap.has(tweet.id)) {
          existingMap.set(tweet.id, tweet);
          addedCount++;
        } else {
          // Update existing tweet metrics dynamically
          const existing = existingMap.get(tweet.id);
          // If the newly scanned text is longer (expanded via Show more), update it
          if (tweet.text && tweet.text.length > (existing.text || "").length) {
            existing.text = tweet.text;
            existing.hashtags = tweet.hashtags;
            existing.mentions = tweet.mentions;
          }
          existing.likes = Math.max(existing.likes, tweet.likes);
          existing.retweets = Math.max(existing.retweets, tweet.retweets);
          existing.replies = Math.max(existing.replies, tweet.replies);
          existing.views = Math.max(existing.views, tweet.views);
        }
      });
      
      const mergedList = Array.from(existingMap.values());
      chrome.storage.local.set({ scraped_tweets: mergedList }, () => {
        // Update active scraper stats
        if (tabId && activeScrapers[tabId]) {
          activeScrapers[tabId].scrapedCount = message.sessionCount || 0;
        }
        
        broadcastToPopup({ 
          action: "TWEETS_SAVED", 
          totalCount: mergedList.length, 
          added: addedCount 
        });
        
        sendResponse({ count: mergedList.length });
      });
    });
    
    return true; // Keep message channel open for async response
  } 
  
  else if (message.action === "SCRAPE_COMPLETED") {
    if (tabId && activeScrapers[tabId]) {
      activeScrapers[tabId].status = "COMPLETED";
      activeScrapers[tabId].reason = message.reason;
      
      broadcastToPopup({ 
        action: "SCRAPE_FINISHED", 
        tabId, 
        reason: message.reason,
        count: message.count
      });
      
      delete activeScrapers[tabId];
    }
    sendResponse({ status: "ACK" });
  }
  
  else if (message.action === "GET_ACTIVE_JOBS") {
    sendResponse({ activeScrapers });
  }
});

// Broadcast helper to popup or dashboard if open
function broadcastToPopup(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    // Suppress error since popup might be closed, which is perfectly normal
  });
}
