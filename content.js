// Content Script for X-Post Scraper

let scrollInterval = null;
let isScraping = false;
let scrapedCount = 0;
let maxLimit = 100;
let scrollDelay = 2000;
let lastScrollHeight = 0;
let sameHeightCount = 0;
let sessionTweetIds = new Set();

// Set up message listener from popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_SCRAPING") {
    if (isScraping) {
      sendResponse({ status: "ALREADY_RUNNING", count: scrapedCount });
      return;
    }
    isScraping = true;
    maxLimit = (typeof message.limit === "number") ? message.limit : 100;
    scrollDelay = message.delay || 2000;
    scrapedCount = 0;
    sessionTweetIds.clear();
    
    // Notify background script we started
    chrome.runtime.sendMessage({ 
      action: "SCRAPE_STARTED", 
      url: window.location.href,
      profile: detectProfile()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("SCRAPE_STARTED response error:", chrome.runtime.lastError.message);
      }
    });

    startScrollAndScrape();
    sendResponse({ status: "STARTED" });
  } else if (message.action === "STOP_SCRAPING") {
    stopScraping("STOPPED_BY_USER");
    sendResponse({ status: "STOPPED", count: scrapedCount });
  } else if (message.action === "GET_STATUS") {
    sendResponse({ 
      isScraping: isScraping, 
      count: scrapedCount, 
      profile: detectProfile() 
    });
  }
});

// Helper: Parse abbreviated metrics like 1.2K, 4.5M to full numbers
function parseMetric(text) {
  if (!text) return 0;
  // Clean text and extract numbers/letters
  const cleanText = text.trim().toUpperCase().replace(/,/g, '');
  const match = cleanText.match(/^([\d.]+)\s*([KM])?$/);
  if (!match) {
    // Try to extract any number
    const numMatch = cleanText.match(/[\d.]+/);
    return numMatch ? parseFloat(numMatch[0]) : 0;
  }
  
  let val = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'K') val *= 1000;
  else if (suffix === 'M') val *= 1000000;
  
  return Math.round(val);
}

// Helper: Clean up tweet text
function cleanTweetText(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  
  // Clean up any nested "Show more" buttons if they exist in the clone
  try {
    const stableLinks = clone.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
    stableLinks.forEach(sl => sl.remove());
    
    const clickables = clone.querySelectorAll('[role="button"], span, a');
    clickables.forEach(c => {
      const text = (c.innerText || c.textContent || "").trim();
      if (text === 'Show more' || text === 'Show More') {
        c.remove();
      }
    });
  } catch (err) {
    console.error("Error cleaning clone text elements: ", err);
  }

  let txt = clone.innerText;
  
  // Double safety: strip "Show more" suffix if it somehow leaked through
  txt = txt.replace(/\s*Show\s+more$/i, "");
  return txt;
}

// Detect if we are on a user's profile page and return profile handle
function detectProfile() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(p => p.length > 0);
  
  // X.com/Twitter.com profile path is typically x.com/username
  // Exclude common reserved directories
  const reserved = [
    'home', 'explore', 'notifications', 'messages', 'search', 'settings', 
    'i', 'trends', 'tos', 'privacy', 'about', 'jobs', 'developer', 
    'download', 'share', 'compose', 'account'
  ];
  
  if (parts.length === 1 && !reserved.includes(parts[0].toLowerCase())) {
    return {
      handle: `@${parts[0]}`,
      username: parts[0]
    };
  }
  
  // Check if we are on specific subpages of user profiles
  if (parts.length === 2 && ['with_replies', 'media', 'likes'].includes(parts[1].toLowerCase()) && !reserved.includes(parts[0].toLowerCase())) {
    return {
      handle: `@${parts[0]}`,
      username: parts[0]
    };
  }
  
  return null;
}

// Scrape profile header metadata if on a profile page
function scrapeProfileMetadata() {
  const profileInfo = detectProfile();
  if (!profileInfo) return null;
  
  try {
    const userNameElem = document.querySelector('[data-testid="UserName"]');
    if (!userNameElem) return null;
    
    // Scrape display name (usually first div/span)
    const displayNameElem = userNameElem.querySelector('span');
    const displayName = displayNameElem ? displayNameElem.innerText : profileInfo.username;
    
    // Scrape Bio description
    const bioElem = document.querySelector('[data-testid="UserDescription"]');
    const bio = bioElem ? bioElem.innerText : "";
    
    // Scrape following and followers
    let following = 0;
    let followers = 0;
    
    const followingElem = document.querySelector(`a[href="/${profileInfo.username}/following"]`);
    if (followingElem) {
      const span = followingElem.querySelector('span');
      if (span) following = parseMetric(span.innerText || followingElem.innerText);
    }
    
    const followersElem = document.querySelector(`a[href="/${profileInfo.username}/followers"]`) || 
                          document.querySelector(`a[href="/${profileInfo.username}/verified_followers"]`);
    if (followersElem) {
      const span = followersElem.querySelector('span');
      if (span) followers = parseMetric(span.innerText || followersElem.innerText);
    }
    
    // Scrape Avatar URL
    let avatarUrl = "";
    // Primary header container avatar
    const avatarImg = document.querySelector(`div[data-testid="primaryColumn"] a[href*="/photo"] img[src*="profile_images"]`) ||
                      document.querySelector(`div[data-testid="primaryColumn"] img[src*="profile_images"]`);
    if (avatarImg) {
      avatarUrl = avatarImg.src;
    }
    
    return {
      username: profileInfo.username,
      handle: profileInfo.handle,
      displayName: displayName,
      bio: bio,
      following: following,
      followers: followers,
      avatarUrl: avatarUrl,
      scrapedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error scraping profile metadata: ", error);
    return null;
  }
}

// Core function: Scrapes visible tweets on the screen
function scrapeVisibleTweets() {
  const tweets = [];
  const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
  const profileInfo = detectProfile();
  
  tweetElements.forEach(elem => {
    try {
      // Expand tweet if truncated ("Show more" button exists)
      try {
        // 1. Direct target of X's stable test-id element for expanding truncated posts
        const stableShowMore = elem.querySelector('[data-testid="tweet-text-show-more-link"]');
        if (stableShowMore) {
          const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
          const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
          const click = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          stableShowMore.dispatchEvent(mousedown);
          stableShowMore.dispatchEvent(mouseup);
          stableShowMore.dispatchEvent(click);
        } else {
          // 2. Resilient text fallback (for translation or alternative layouts)
          const clickables = elem.querySelectorAll('[role="button"], span, a');
          for (let btn of clickables) {
            const btnText = (btn.innerText || btn.textContent || "").trim();
            if (btnText === 'Show more' || btnText === 'Show More') {
              const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
              const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
              const click = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              btn.dispatchEvent(mousedown);
              btn.dispatchEvent(mouseup);
              btn.dispatchEvent(click);
              break;
            }
          }
        }
      } catch (e) {
        console.error("Error expanding tweet: ", e);
      }

      // 1. Tweet status link / ID
      const links = elem.querySelectorAll('a[href*="/status/"]');
      let tweetId = "";
      let tweetUrl = "";
      
      for (let link of links) {
        const href = link.getAttribute('href');
        const match = href.match(/\/([^\/]+)\/status\/(\d+)/);
        if (match) {
          tweetId = match[2];
          tweetUrl = `https://x.com${href}`;
          break;
        }
      }
      
      // If we couldn't resolve a Tweet ID, skip it
      if (!tweetId) return;
      
      // 2. User info (Name & Handle)
      const userElem = elem.querySelector('[data-testid="User-Name"]');
      let userDisplayName = "Unknown";
      let userHandle = "";
      
      if (userElem) {
        const spans = userElem.querySelectorAll('span');
        if (spans.length > 0) {
          userDisplayName = spans[0].innerText;
        }
        
        // Find handle (starts with @)
        for (let span of spans) {
          const txt = span.innerText;
          if (txt.startsWith('@')) {
            userHandle = txt;
            break;
          }
        }
      }
      
      // 3. User Avatar
      let avatar = "";
      const avatarImg = elem.querySelector('div[data-testid="Tweet-User-Avatar"] img') || 
                        elem.querySelector('img[src*="profile_images"]');
      if (avatarImg) {
        avatar = avatarImg.src;
      }
      
      // 4. Tweet Text
      const textElem = elem.querySelector('[data-testid="tweetText"]');
      const text = textElem ? cleanTweetText(textElem) : "";
      
      // 5. Timestamp
      const timeElem = elem.querySelector('time');
      const timestamp = timeElem ? timeElem.getAttribute('datetime') : new Date().toISOString();
      
      // 6. Metrics (Likes, Retweets, Replies, Views)
      let replies = 0;
      let retweets = 0;
      let likes = 0;
      let views = 0;
      
      const replyBtn = elem.querySelector('[data-testid="reply"]');
      if (replyBtn) {
        // Try getting text or aria-label
        const text = replyBtn.innerText || replyBtn.getAttribute('aria-label') || "";
        replies = parseMetric(text);
      }
      
      const retweetBtn = elem.querySelector('[data-testid="retweet"]');
      if (retweetBtn) {
        const text = retweetBtn.innerText || retweetBtn.getAttribute('aria-label') || "";
        retweets = parseMetric(text);
      }
      
      const likeBtn = elem.querySelector('[data-testid="like"]');
      if (likeBtn) {
        const text = likeBtn.innerText || likeBtn.getAttribute('aria-label') || "";
        likes = parseMetric(text);
      }
      
      const viewBtn = elem.querySelector('[data-testid="app_play"]') || 
                       elem.querySelector('a[href*="/analytics"]');
      if (viewBtn) {
        const text = viewBtn.innerText || viewBtn.getAttribute('aria-label') || "";
        views = parseMetric(text);
      } else {
        // Look for view/analytics elements
        const spans = elem.querySelectorAll('span');
        for (let span of spans) {
          const ariaLabel = span.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.toLowerCase().includes('view')) {
            views = parseMetric(ariaLabel);
            break;
          }
        }
      }
      
      // 7. Media (Images & Videos)
      const media = [];
      const imgElems = elem.querySelectorAll('[data-testid="tweetPhoto"] img');
      imgElems.forEach(img => {
        if (img.src && !media.includes(img.src)) {
          media.push(img.src);
        }
      });
      
      const videoElems = elem.querySelectorAll('video');
      videoElems.forEach(vid => {
        if (vid.src && !media.includes(vid.src)) {
          media.push(vid.src);
        } else {
          // Poster source
          const poster = vid.getAttribute('poster');
          if (poster && !media.includes(poster)) {
            media.push(poster);
          }
        }
      });
      
      // 8. Hashtags & Mentions
      const hashtags = [];
      const mentions = [];
      
      if (textElem) {
        const links = textElem.querySelectorAll('a');
        links.forEach(link => {
          const txt = link.innerText;
          if (txt.startsWith('#')) {
            hashtags.push(txt.replace('#', ''));
          } else if (txt.startsWith('@')) {
            mentions.push(txt.replace('@', ''));
          }
        });
      }
      
      // Construct Tweet Object
      tweets.push({
        id: tweetId,
        tweetUrl: tweetUrl,
        userDisplayName: userDisplayName,
        userHandle: userHandle,
        userAvatar: avatar,
        text: text,
        timestamp: timestamp,
        replies: replies,
        retweets: retweets,
        likes: likes,
        views: views,
        hashtags: hashtags,
        mentions: mentions,
        media: media,
        scrapedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error parsing single tweet: ", err);
    }
  });
  
  return tweets;
}

// Helper: Check if page is currently loading new content
function isPageLoading() {
  return !!(
    document.querySelector('[role="progressbar"]') ||
    document.querySelector('[data-testid="spinner"]') ||
    document.querySelector('svg[class*="spinner"]') ||
    document.querySelector('.loading-spinner')
  );
}

// Scrolling and Scraping controller loop
function startScrollAndScrape() {
  lastScrollHeight = document.documentElement.scrollHeight;
  sameHeightCount = 0;
  
  // Scrape profile metadata first, if on profile page
  const profileMetadata = scrapeProfileMetadata();
  if (profileMetadata) {
    chrome.runtime.sendMessage({
      action: "PROFILE_SCRAPED",
      profile: profileMetadata
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("PROFILE_SCRAPED response error:", chrome.runtime.lastError.message);
      }
    });
  }

  // Interval-based loop
  scrollInterval = setInterval(() => {
    if (!isScraping) return;
    
    // Skip if tab is in background (hidden) to prevent Chrome throttling & false bottom-reached triggers
    if (document.hidden) return;
    
    // 1. Scrape current screen
    const newTweets = scrapeVisibleTweets();
    newTweets.forEach(t => {
      if (t.id) sessionTweetIds.add(t.id);
    });
    scrapedCount = sessionTweetIds.size;
    
    // 2. Send to background to save & get current count
    chrome.runtime.sendMessage({
      action: "TWEETS_SCRAPED",
      tweets: newTweets,
      profile: detectProfile(),
      sessionCount: scrapedCount
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("TWEETS_SCRAPED response error:", chrome.runtime.lastError.message);
        return;
      }
      
      // Check if we hit limit
      if (maxLimit !== 0 && scrapedCount >= maxLimit) {
        stopScraping("LIMIT_REACHED");
      }
    });
    
    // 3. Scroll down
    window.scrollBy(0, 750);
    
    // 4. Check if we've reached the bottom
    setTimeout(() => {
      if (document.hidden) {
        // Skip check if tab is hidden
        return;
      }
      const currentScrollHeight = document.documentElement.scrollHeight;
      if (currentScrollHeight === lastScrollHeight) {
        // If there's a loading spinner/progressbar, the page is trying to load content.
        // We should wait and not count this as "bottom reached".
        if (isPageLoading()) {
          sameHeightCount = 0;
          return;
        }
        
        sameHeightCount++;
        if (sameHeightCount >= 15) { // 30 seconds threshold
          stopScraping("BOTTOM_REACHED");
        }
      } else {
        sameHeightCount = 0;
        lastScrollHeight = currentScrollHeight;
      }
    }, 500);
    
  }, scrollDelay);
}

// Stop function and notify background worker
function stopScraping(reason) {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  if (isScraping) {
    isScraping = false;
    chrome.runtime.sendMessage({
      action: "SCRAPE_COMPLETED",
      reason: reason,
      count: scrapedCount
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("SCRAPE_COMPLETED response error:", chrome.runtime.lastError.message);
      }
    });
  }
}

// Reactivate and resume scraping instantly when user switches back to this tab
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && isScraping) {
    // Reset layout boundary caches since height is stale after background throttling
    lastScrollHeight = document.documentElement.scrollHeight;
    sameHeightCount = 0;
    
    // Proactively scroll slightly to kickstart the timeline updates
    window.scrollBy(0, 100);
  }
});
