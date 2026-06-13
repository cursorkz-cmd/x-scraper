// Dashboard JS Script for X-Post Scraper Control Dashboard

document.addEventListener("DOMContentLoaded", () => {
  // Global Caches
  let tweets = [];
  let profiles = {};
  let filteredTweets = [];
  
  // Pagination State
  let currentPage = 1;
  const pageSize = 10;

  // DOM Elements
  const tabButtons = document.querySelectorAll(".nav-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const tabTitle = document.getElementById("tab-title");
  const tabSubtitle = document.getElementById("tab-subtitle");
  
  // Status Elements
  const systemStatusDot = document.getElementById("system-status-dot");
  const systemStatusLabel = document.getElementById("system-status-label");
  const systemStatusDesc = document.getElementById("system-status-desc");

  // KPI elements
  const kpiTweets = document.getElementById("kpi-tweets");
  const kpiAuthors = document.getElementById("kpi-authors");
  const kpiLikes = document.getElementById("kpi-likes");
  const kpiHashtags = document.getElementById("kpi-hashtags");

  // Chart Containers
  const hashtagChartContainer = document.getElementById("hashtag-chart-container");
  const authorChartContainer = document.getElementById("author-chart-container");

  // Tab - Profiles Hub
  const profilesGridContainer = document.getElementById("profiles-grid-container");

  // Tab - Tweet Ledger (Filters & Table)
  const ledgerSearch = document.getElementById("ledger-search");
  const filterAuthor = document.getElementById("filter-author");
  const filterEngagement = document.getElementById("filter-engagement");
  const ledgerSort = document.getElementById("ledger-sort");
  const tweetsTbody = document.getElementById("tweets-tbody");
  const tableEmpty = document.getElementById("table-empty");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");

  // Pagination Elements
  const paginationInfo = document.getElementById("pagination-info");
  const btnPagePrev = document.getElementById("btn-page-prev");
  const btnPageNext = document.getElementById("btn-page-next");
  const pageNumbersContainer = document.getElementById("page-numbers-container");

  // Action Buttons
  const btnExportOptions = document.getElementById("btn-export-options");
  const exportMenu = document.getElementById("export-menu");
  const btnClearDb = document.getElementById("btn-clear-db");
  const modalClearConfirm = document.getElementById("modal-clear-confirm");
  const modalConfirmYes = document.getElementById("modal-confirm-yes");
  const modalConfirmNo = document.getElementById("modal-confirm-no");

  // ----------------------------------------------------
  // 1. Init & Data Sync
  // ----------------------------------------------------
  
  function init() {
    loadDatabase();
    checkActiveScrapers();
    
    // Set up recurring checks
    setInterval(checkActiveScrapers, 3000);
  }

  // Fetch tweets and profiles from chrome.storage.local
  function loadDatabase() {
    chrome.storage.local.get(["scraped_tweets", "scraped_profiles"], (result) => {
      tweets = result.scraped_tweets || [];
      profiles = result.scraped_profiles || {};
      
      // Update displays
      updateAnalyticsUI();
      updateProfilesHubUI();
      populateAuthorFilterDropdown();
      applyLedgerFilters();
    });
  }

  // Check background service worker for active tasks
  function checkActiveScrapers() {
    chrome.runtime.sendMessage({ action: "GET_ACTIVE_JOBS" }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      
      const jobs = response.activeScrapers || {};
      const activeIds = Object.keys(jobs);
      
      if (activeIds.length > 0) {
        // Scraper is active!
        systemStatusDot.className = "status-dot active";
        systemStatusLabel.innerText = "Scraping active...";
        
        const firstJob = jobs[activeIds[0]];
        const target = firstJob.profile ? firstJob.profile.handle : "X Page";
        systemStatusDesc.innerText = `Actively scrolling and scraping posts from ${target}. Extracted ${firstJob.scrapedCount} so far.`;
        
        // Dynamic database reload when scraper is running to keep dashboard live
        loadDatabase();
      } else {
        // Idle
        systemStatusDot.className = "status-dot";
        systemStatusLabel.innerText = "Monitoring X tab";
        systemStatusDesc.innerText = "All scraping operations are currently idle.";
      }
    });
  }

  // ----------------------------------------------------
  // 2. Tab Navigation Orchestration
  // ----------------------------------------------------
  
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // Toggle button classes
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Toggle tab panel views
      const targetTab = btn.getAttribute("data-tab");
      tabPanes.forEach(pane => {
        pane.classList.remove("active");
        if (pane.id === targetTab) {
          pane.classList.add("active");
        }
      });
      
      // Adjust header info based on selected tab
      if (targetTab === "tab-analytics") {
        tabTitle.innerText = "Analytics & Trends";
        tabSubtitle.innerText = "Real-time engagement analysis, author profiles, and hashtag counts";
      } else if (targetTab === "tab-authors") {
        tabTitle.innerText = "Scraped Author Hub";
        tabSubtitle.innerText = "Interactive metadata directory for detected profiles";
      } else if (targetTab === "tab-ledger") {
        tabTitle.innerText = "Tweet Ledger";
        tabSubtitle.innerText = "Search, filter, and audit detailed post entries";
      }
    });
  });

  // ----------------------------------------------------
  // 3. Tab 1: Analytics & Visual Trends (Custom SVG Charts)
  // ----------------------------------------------------
  
  function updateAnalyticsUI() {
    // A. Update KPIs
    kpiTweets.innerText = tweets.length.toLocaleString();
    
    // Unique Authors
    const uniqueAuthors = new Set(tweets.map(t => t.userHandle));
    kpiAuthors.innerText = uniqueAuthors.size.toLocaleString();
    
    // Average Engagement Rate (Likes + Retweets + Replies) per tweet
    if (tweets.length > 0) {
      const totalEngagement = tweets.reduce((acc, curr) => acc + (curr.likes || 0) + (curr.retweets || 0) + (curr.replies || 0), 0);
      const avg = Math.round(totalEngagement / tweets.length);
      kpiLikes.innerText = avg.toLocaleString();
    } else {
      kpiLikes.innerText = "0";
    }

    // Hashtags Density (Total Unique Hashtags detected)
    const allHashtags = [];
    tweets.forEach(t => {
      if (t.hashtags) allHashtags.push(...t.hashtags.map(h => h.toLowerCase()));
    });
    const uniqueHashtags = new Set(allHashtags);
    kpiHashtags.innerText = uniqueHashtags.size.toLocaleString();

    // B. Draw Custom Charts
    drawHashtagsChart(allHashtags);
    drawAuthorsChart();
  }

  // Draw vertical SVG hashtag chart
  function drawHashtagsChart(allHashtags) {
    if (allHashtags.length === 0) {
      hashtagChartContainer.innerHTML = `<div class="loading-state">Scrape X data to populate trends</div>`;
      return;
    }

    // Process frequency
    const freq = {};
    allHashtags.forEach(h => freq[h] = (freq[h] || 0) + 1);
    
    // Sort and get Top 6
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    
    if (sorted.length === 0) {
      hashtagChartContainer.innerHTML = `<div class="loading-state">No hashtags detected in scraping yet</div>`;
      return;
    }

    const maxVal = sorted[0][1];
    
    // Generate inline SVG
    let svgHtml = `
      <svg class="svg-chart" viewBox="0 0 400 280">
        <!-- Gradients Definitions -->
        <defs>
          <linearGradient id="neon-cyan-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#4facfe" />
            <stop offset="100%" stop-color="#00f2fe" />
          </linearGradient>
          <linearGradient id="hover-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#7f00ff" />
            <stop offset="100%" stop-color="#00f2fe" />
          </linearGradient>
        </defs>
        
        <!-- Y-Axis Grid Lines -->
        <line x1="40" y1="40" x2="380" y2="40" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        <line x1="40" y1="90" x2="380" y2="90" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        <line x1="40" y1="140" x2="380" y2="140" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        <line x1="40" y1="190" x2="380" y2="190" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        
        <!-- X/Y Axes Base lines -->
        <line x1="40" y1="230" x2="380" y2="230" stroke="var(--border)" stroke-width="1.5" />
        <line x1="40" y1="20" x2="40" y2="230" stroke="var(--border)" stroke-width="1.5" />
    `;

    // Draw Bars
    const chartHeight = 190; // scale space height from Y=40 to Y=230
    const barWidth = 35;
    const gap = 18;
    const startX = 55;
    
    sorted.forEach((item, idx) => {
      const tag = `#${item[0]}`;
      const count = item[1];
      
      const barHeight = Math.max(12, (count / maxVal) * chartHeight);
      const x = startX + idx * (barWidth + gap);
      const y = 230 - barHeight;
      
      svgHtml += `
        <g class="chart-bar-group" data-hashtag="${item[0]}">
          <!-- Main Bar -->
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="url(#neon-cyan-grad)" />
          
          <!-- Count text on top -->
          <text class="chart-bar-text" x="${x + barWidth/2}" y="${y - 8}" text-anchor="middle">${count}</text>
          
          <!-- Label text under X-axis -->
          <text class="chart-bar-label" x="${x + barWidth/2}" y="${250}" text-anchor="middle" transform="rotate(-15, ${x + barWidth/2}, 250)">${tag.substring(0, 10)}${tag.length > 10 ? '..' : ''}</text>
          
          <title>${tag}: ${count} tweets</title>
        </g>
      `;
    });

    svgHtml += `</svg>`;
    hashtagChartContainer.innerHTML = svgHtml;
    // Attach click listeners after DOM injection (avoids CSP inline-handler violation)
    hashtagChartContainer.querySelectorAll(".chart-bar-group").forEach(g => {
      g.addEventListener("click", () => filterLedgerByHashtag(g.dataset.hashtag));
    });
  }

  // Draw horizontal SVG Active Authors distribution chart
  function drawAuthorsChart() {
    if (tweets.length === 0) {
      authorChartContainer.innerHTML = `<div class="loading-state">Scrape profiles to show distribution</div>`;
      return;
    }

    // Process post frequency per user handle
    const freq = {};
    tweets.forEach(t => {
      if (t.userHandle) freq[t.userHandle] = (freq[t.userHandle] || 0) + 1;
    });

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
      authorChartContainer.innerHTML = `<div class="loading-state">No user handles found</div>`;
      return;
    }

    const maxVal = sorted[0][1];

    let svgHtml = `
      <svg class="svg-chart" viewBox="0 0 400 280">
        <defs>
          <linearGradient id="purple-pink-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#7f00ff" />
            <stop offset="100%" stop-color="#ff007f" />
          </linearGradient>
        </defs>
        
        <!-- Y Axis Baseline -->
        <line x1="85" y1="20" x2="85" y2="230" stroke="var(--border)" stroke-width="1.5" />
        <line x1="85" y1="230" x2="380" y2="230" stroke="var(--border)" stroke-width="1.5" />
    `;

    const barHeight = 22;
    const gap = 16;
    const startY = 32;
    const chartWidth = 270; // scale space from X=85 to X=355

    sorted.forEach((item, idx) => {
      const handle = item[0];
      const count = item[1];
      
      const barWidth = Math.max(15, (count / maxVal) * chartWidth);
      const y = startY + idx * (barHeight + gap);
      const x = 85;
      
      svgHtml += `
        <g class="chart-bar-group" data-handle="${handle}">
          <!-- Horizontal Bar -->
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#purple-pink-grad)" />
          
          <!-- Handle label at left -->
          <text class="chart-bar-label" x="${x - 10}" y="${y + barHeight/2 + 4}" text-anchor="end" fill="var(--text-muted)" style="font-size: 11px;">${handle.substring(0, 10)}${handle.length > 10 ? '..' : ''}</text>
          
          <!-- Count text inside bar end -->
          <text class="chart-bar-text" x="${x + barWidth + 8}" y="${y + barHeight/2 + 4}" fill="#fff" style="font-weight: 700; font-size: 10px;">${count}</text>
          
          <title>${handle}: ${count} posts</title>
        </g>
      `;
    });

    svgHtml += `</svg>`;
    authorChartContainer.innerHTML = svgHtml;
    // Attach click listeners after DOM injection (avoids CSP inline-handler violation)
    authorChartContainer.querySelectorAll(".chart-bar-group").forEach(g => {
      g.addEventListener("click", () => filterLedgerByAuthor(g.dataset.handle));
    });
  }

  // Filter navigation helpers — local functions, called only via event listeners (no inline onclick)
  function filterLedgerByHashtag(hashtag) {
    document.querySelector('[data-tab="tab-ledger"]').click();
    ledgerSearch.value = `#${hashtag}`;
    applyLedgerFilters();
  }

  function filterLedgerByAuthor(handle) {
    document.querySelector('[data-tab="tab-ledger"]').click();
    filterAuthor.value = handle;
    applyLedgerFilters();
  }

  // ----------------------------------------------------
  // 4. Tab 2: Scraped Author Hub (User Profiles Grid)
  // ----------------------------------------------------
  
  function updateProfilesHubUI() {
    const profileKeys = Object.keys(profiles);
    
    if (profileKeys.length === 0) {
      profilesGridContainer.innerHTML = `
        <div class="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <h4>No scraped profiles available</h4>
          <p>Navigate to an X profile, start scraping to extract author biographies, follows, and display tags.</p>
        </div>
      `;
      return;
    }

    profilesGridContainer.innerHTML = "";

    profileKeys.forEach(key => {
      const p = profiles[key];
      
      // Calculate how many tweets we scraped for this author
      const authorTweetsCount = tweets.filter(t => t.userHandle.toLowerCase() === p.handle.toLowerCase()).length;
      
      const card = document.createElement("div");
      card.className = "profile-card glass-card";
      card.innerHTML = `
        <div class="profile-card-top">
          <img class="profile-card-avatar" src="${p.avatarUrl || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
          <div class="profile-card-names">
            <span class="profile-card-name">${p.displayName}</span>
            <span class="profile-card-handle">${p.handle}</span>
          </div>
        </div>
        <p class="profile-card-bio">${p.bio || "No description provided."}</p>
        <div class="profile-card-stats">
          <div class="profile-card-stat">
            <span class="profile-card-stat-val">${formatMetricNumber(p.following)}</span>
            <span class="profile-card-stat-lbl">Following</span>
          </div>
          <div class="profile-card-stat">
            <span class="profile-card-stat-val">${formatMetricNumber(p.followers)}</span>
            <span class="profile-card-stat-lbl">Followers</span>
          </div>
          <div class="profile-card-stat">
            <span class="profile-card-stat-val" style="color: var(--accent-cyan);">${authorTweetsCount}</span>
            <span class="profile-card-stat-lbl">Tweets Scraped</span>
          </div>
        </div>
        <button class="btn btn-dashboard profile-ledger-btn" style="margin-top: auto; font-size: 0.8rem; padding: 0.5rem 1rem;" data-handle="${p.handle}">
          View Scraped Posts
        </button>
      `;
      // Bind listener after card is built so filterLedgerByAuthor is reachable
      card.querySelector(".profile-ledger-btn").addEventListener("click", () => filterLedgerByAuthor(p.handle));
      profilesGridContainer.appendChild(card);
    });
  }

  // Format metric numbers beautifully
  function formatMetricNumber(num) {
    if (!num) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
  }

  // ----------------------------------------------------
  // 5. Tab 3: Tweet Ledger Operations (Spreadsheet Table)
  // ----------------------------------------------------
  
  // Populate the author dropdown list filter on the ledger page
  function populateAuthorFilterDropdown() {
    // Save current selection
    const selectedVal = filterAuthor.value;
    
    // Clear other options besides ALL
    filterAuthor.innerHTML = `<option value="ALL">All Authors</option>`;
    
    // Collect unique authors in tweets
    const uniqueHandles = Array.from(new Set(tweets.map(t => t.userHandle))).sort();
    
    uniqueHandles.forEach(handle => {
      const option = document.createElement("option");
      option.value = handle;
      option.innerText = handle;
      filterAuthor.appendChild(option);
    });
    
    // Restore selection if still exists
    if (uniqueHandles.includes(selectedVal)) {
      filterAuthor.value = selectedVal;
    }
  }

  // Apply inputs, search terms, and sort orders, then re-render page
  function applyLedgerFilters() {
    const query = ledgerSearch.value.toLowerCase().trim();
    const selectedAuthor = filterAuthor.value;
    const minLikes = parseInt(filterEngagement.value);
    const sort = ledgerSort.value;

    // 1. Filtering
    filteredTweets = tweets.filter(t => {
      // Search Box Match
      const searchMatch = !query || 
                          t.text.toLowerCase().includes(query) || 
                          t.userDisplayName.toLowerCase().includes(query) || 
                          t.userHandle.toLowerCase().includes(query) || 
                          (t.hashtags && t.hashtags.some(h => h.toLowerCase().includes(query)));
      
      // Author Dropdown Match
      const authorMatch = selectedAuthor === "ALL" || t.userHandle.toLowerCase() === selectedAuthor.toLowerCase();
      
      // Engagement Level Match
      const engagementMatch = (t.likes || 0) >= minLikes;

      return searchMatch && authorMatch && engagementMatch;
    });

    // 2. Sorting
    filteredTweets.sort((a, b) => {
      if (sort === "newest") return new Date(b.timestamp) - new Date(a.timestamp);
      if (sort === "oldest") return new Date(a.timestamp) - new Date(b.timestamp);
      if (sort === "likes") return (b.likes || 0) - (a.likes || 0);
      if (sort === "retweets") return (b.retweets || 0) - (a.retweets || 0);
      if (sort === "views") return (b.views || 0) - (a.views || 0);
      return 0;
    });

    // Reset pagination to first page
    currentPage = 1;
    renderLedgerTable();
  }

  // Render paginated data table rows
  function renderLedgerTable() {
    tweetsTbody.innerHTML = "";
    
    if (filteredTweets.length === 0) {
      tableEmpty.classList.remove("hidden");
      paginationInfo.innerText = "Showing 0 to 0 of 0 entries";
      pageNumbersContainer.innerHTML = "";
      btnPagePrev.disabled = true;
      btnPageNext.disabled = true;
      return;
    }
    
    tableEmpty.classList.add("hidden");
    
    // Calculate Pagination boundaries
    const totalCount = filteredTweets.length;
    const maxPages = Math.ceil(totalCount / pageSize);
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalCount);
    const paginatedItems = filteredTweets.slice(startIndex, endIndex);

    // Update info bar text
    paginationInfo.innerText = `Showing ${startIndex + 1} to ${endIndex} of ${totalCount} entries`;
    
    // Set button enabled/disabled statuses
    btnPagePrev.disabled = currentPage === 1;
    btnPageNext.disabled = currentPage === maxPages;

    // Render page buttons
    renderPageNumberPills(maxPages);

    // Build row components
    paginatedItems.forEach(t => {
      const localDate = new Date(t.timestamp).toLocaleDateString();
      const localTime = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let mediaPreviewHtml = "";
      if (t.media && t.media.length > 0) {
        mediaPreviewHtml = `<div class="table-media-preview">`;
        t.media.forEach(url => {
          mediaPreviewHtml += `<img class="table-media-thumb" src="${url}" onerror="this.style.display='none'">`;
        });
        mediaPreviewHtml += `</div>`;
      }

      // Highlight hashtags/mentions — use data attributes; clicks handled by delegated listener on tweetsTbody
      let formattedText = t.text;
      formattedText = formattedText.replace(/#(\w+)/g, '<a href="#" class="hashtag-link" data-hashtag="$1">#$1</a>');
      formattedText = formattedText.replace(/@(\w+)/g, '<a href="#" class="author-link" data-author="@$1">@$1</a>');

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" class="row-select-checkbox" data-id="${t.id}"></td>
        <td>
          <div class="table-avatar-cell">
            <img class="table-avatar" src="${t.userAvatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
            <div class="table-author-details">
              <span class="table-author-name">${t.userDisplayName}</span>
              <span class="table-author-handle">${t.userHandle}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="table-text-cell">${formattedText}</div>
          ${mediaPreviewHtml}
        </td>
        <td class="text-center table-num">${formatMetricNumber(t.replies)}</td>
        <td class="text-center table-num">${formatMetricNumber(t.retweets)}</td>
        <td class="text-center table-num" style="color: var(--accent-cyan); font-weight:700;">${formatMetricNumber(t.likes)}</td>
        <td class="text-center table-num">${formatMetricNumber(t.views)}</td>
        <td>
          <div style="font-weight:600; color:#fff;">${localDate}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${localTime}</div>
        </td>
        <td>
          <div class="row-actions">
            <a href="${t.tweetUrl}" target="_blank" class="btn-icon-only" title="Open Original Tweet">
              <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
            </a>
            <button class="btn-icon-only copy-text-btn" data-id="${t.id}" title="Copy Tweet text">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            <button class="btn-icon-only delete delete-row-btn" data-id="${t.id}" title="Delete Post">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </td>
      `;
      
      // Bind inline row listeners
      tr.querySelector(".copy-text-btn").addEventListener("click", () => copyTweetText(t.text));
      tr.querySelector(".delete-row-btn").addEventListener("click", () => deleteTweetRow(t.id));
      
      tweetsTbody.appendChild(tr);
    });

    // Reset select all state
    selectAllCheckbox.checked = false;
  }

  // Render pagination indicator bubbles
  function renderPageNumberPills(maxPages) {
    pageNumbersContainer.innerHTML = "";
    
    // Simple pagination layout
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(maxPages, start + 4);
    
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    
    for (let i = start; i <= end; i++) {
      const btn = document.createElement("button");
      btn.className = `page-num-btn ${i === currentPage ? 'active' : ''}`;
      btn.innerText = i;
      btn.addEventListener("click", () => {
        currentPage = i;
        renderLedgerTable();
      });
      pageNumbersContainer.appendChild(btn);
    }
  }

  // Row operations: Copy to clipboard
  function copyTweetText(text) {
    navigator.clipboard.writeText(text).then(() => {
      // Alert with custom toast in future or console log
      console.log("Tweet text copied to clipboard!");
    });
  }

  // Row operations: Delete entry
  function deleteTweetRow(id) {
    const updatedTweets = tweets.filter(t => t.id !== id);
    
    chrome.storage.local.set({ scraped_tweets: updatedTweets }, () => {
      tweets = updatedTweets;
      applyLedgerFilters();
      updateAnalyticsUI();
      updateProfilesHubUI();
      populateAuthorFilterDropdown();
    });
  }

  // Table Event Listeners
  selectAllCheckbox.addEventListener("change", () => {
    const isChecked = selectAllCheckbox.checked;
    const rowCheckboxes = document.querySelectorAll(".row-select-checkbox");
    rowCheckboxes.forEach(cb => cb.checked = isChecked);
  });

  ledgerSearch.addEventListener("input", applyLedgerFilters);
  filterAuthor.addEventListener("change", applyLedgerFilters);
  filterEngagement.addEventListener("change", applyLedgerFilters);
  ledgerSort.addEventListener("change", applyLedgerFilters);

  // Delegated listener for hashtag/mention links rendered inside tweet text cells
  tweetsTbody.addEventListener("click", (e) => {
    const hashLink = e.target.closest(".hashtag-link");
    const authorLink = e.target.closest(".author-link");
    if (hashLink) {
      e.preventDefault();
      filterLedgerByHashtag(hashLink.dataset.hashtag);
    } else if (authorLink) {
      e.preventDefault();
      filterLedgerByAuthor(authorLink.dataset.author);
    }
  });

  // Pagination buttons
  btnPagePrev.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderLedgerTable();
    }
  });

  btnPageNext.addEventListener("click", () => {
    const maxPages = Math.ceil(filteredTweets.length / pageSize);
    if (currentPage < maxPages) {
      currentPage++;
      renderLedgerTable();
    }
  });

  // ----------------------------------------------------
  // 6. Action Menu & Exports Integrations
  // ----------------------------------------------------

  // Toggle Dropdown Menu
  btnExportOptions.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });

  // Close dropdown on click outside
  document.addEventListener("click", () => {
    exportMenu.classList.add("hidden");
  });

  // Export handlers
  document.getElementById("export-json").addEventListener("click", () => {
    if (filteredTweets.length === 0) return;
    window.ExportUtils.exportToJSON(filteredTweets);
  });

  document.getElementById("export-csv").addEventListener("click", () => {
    if (filteredTweets.length === 0) return;
    window.ExportUtils.exportToCSV(filteredTweets);
  });

  document.getElementById("export-md").addEventListener("click", () => {
    if (filteredTweets.length === 0) return;
    window.ExportUtils.exportToMarkdown(filteredTweets);
  });

  document.getElementById("export-html").addEventListener("click", () => {
    if (filteredTweets.length === 0) return;
    window.ExportUtils.exportToHTML(filteredTweets);
  });

  // ----------------------------------------------------
  // 7. Storage Database Wipe Manager
  // ----------------------------------------------------
  
  btnClearDb.addEventListener("click", () => {
    modalClearConfirm.classList.remove("hidden");
  });

  modalConfirmNo.addEventListener("click", () => {
    modalClearConfirm.classList.add("hidden");
  });

  modalConfirmYes.addEventListener("click", () => {
    chrome.storage.local.clear(() => {
      // Reinitialize base storage
      chrome.storage.local.set({ scraped_tweets: [], scraped_profiles: {} }, () => {
        modalClearConfirm.classList.add("hidden");
        // Reload dashboard state
        loadDatabase();
      });
    });
  });

  // ----------------------------------------------------
  // 8. Event Listener to handle real-time background messages
  // ----------------------------------------------------
  
  chrome.runtime.onMessage.addListener((message) => {
    if (["TWEETS_SAVED", "PROFILE_UPDATED", "SCRAPE_FINISHED"].includes(message.action)) {
      loadDatabase();
    }
  });

  // RUN INIT
  init();
});
