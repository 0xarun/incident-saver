// background.js (MV3 service worker)
// Incident Saver extension background script

// Constants
const ROOT_MENU_ID = "incident_saver_root";
const MENU_INCIDENT = "incident_saver_incident";
const MENU_OCCURRENCE = "incident_saver_occurrence";
const MENU_DETECTION = "incident_saver_detection";
const MENU_RESOLVE = "incident_saver_resolve";
const KEY_CURRENT = "_currentIncident";

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  await initializeContextMenus();
});

// Initialize context menus
async function initializeContextMenus() {
  try {
    await chrome.contextMenus.removeAll();
    
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "Incident Saver",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_INCIDENT,
      parentId: ROOT_MENU_ID,
      title: "Save Incident Number",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_OCCURRENCE,
      parentId: ROOT_MENU_ID,
      title: "Save Occurrence Time",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_DETECTION,
      parentId: ROOT_MENU_ID,
      title: "Save Detection Time",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_RESOLVE,
      parentId: ROOT_MENU_ID,
      title: "Save Resolve Time",
      contexts: ["selection"],
    });
  } catch (e) {
    console.warn("Incident Saver: Failed to create context menus", e);
  }
}

// Main click handler for all menu items
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selection = (info.selectionText || "").trim();
  if (!selection) return;

  try {
    switch (info.menuItemId) {
      case MENU_INCIDENT:
        await setCurrentIncident(selection);
        break;

      case MENU_OCCURRENCE:
        await saveTimestampForCurrentIncident("eventOccurrence", selection);
        break;

      case MENU_DETECTION:
        await saveTimestampForCurrentIncident("eventDetection", selection);
        break;

      case MENU_RESOLVE:
        await saveTimestampForCurrentIncident("eventResolve", selection);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Incident Saver: Error handling menu click', error);
  }
});

// Set current incident
async function setCurrentIncident(incidentNumber) {
  const key = incidentStorageKey(incidentNumber);
  
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => {
      const existing = data[key] || {};
      const updated = {
        incidentNumber,
        ...existing,
      };

      chrome.storage.local.set(
        {
          [key]: updated,
          [KEY_CURRENT]: incidentNumber,
        },
        () => {
          resolve();
        }
      );
    });
  });
}

// Save timestamp for current incident
async function saveTimestampForCurrentIncident(fieldName, selectionText) {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY_CURRENT], async (data) => {
      const currentIncident = data[KEY_CURRENT];
      if (!currentIncident) {
        console.warn(
          "Incident Saver: No current incident set. Use 'Save Incident Number' first."
        );
        resolve();
        return;
      }

      const parsedDate = parseDateFromSelection(selectionText);
      if (!parsedDate) {
        console.warn("Incident Saver: Could not parse date from selection");
        resolve();
        return;
      }

      const iso = parsedDate.toISOString();
      await updateIncident(currentIncident, { [fieldName]: iso });
      resolve();
    });
  });
}

// Get storage key for incident
function incidentStorageKey(incidentNumber) {
  return `incident:${incidentNumber}`;
}

// Update incident data
async function updateIncident(incidentNumber, changes) {
  const key = incidentStorageKey(incidentNumber);
  
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => {
      const existing = data[key] || { incidentNumber };
      const merged = {
        ...existing,
        ...changes,
      };

      // Recompute MTTD and MTTR if we have enough data
      if (merged.eventOccurrence && merged.eventDetection) {
        merged.mttd = timeDiffMs(merged.eventOccurrence, merged.eventDetection);
      }

      if (merged.eventDetection && merged.eventResolve) {
        merged.mttr = timeDiffMs(merged.eventDetection, merged.eventResolve);
      }

      chrome.storage.local.set({ [key]: merged }, () => {
        resolve();
      });
    });
  });
}

// Parse date from selection text
function parseDateFromSelection(sel) {
  sel = (sel || "").trim();
  if (!sel) return null;

  // Try ISO / native parse
  let d = new Date(sel);
  if (!isNaN(d.getTime())) return d;

  // Try common formats: Thu 10/30/2025 12:11 PM, 10/30/2025 12:11 PM, 30/10/2025 12:11
  const regex =
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:[ ,T]*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?))?/;
  let m = sel.match(regex);
  if (m) {
    const datePart = m[1];
    const timePart = m[2] || "";
    const candidate = `${datePart} ${timePart}`.trim();
    d = new Date(candidate);
    if (!isNaN(d.getTime())) return d;
  }

  // Try pattern like "Oct 30, 2025 12:11 PM"
  const regex2 =
    /([A-Za-z]{3,9} \d{1,2},? \d{4})(?:[^\d]*(\d{1,2}:\d{2}(?:[:\d]{0,3})?\s*(?:AM|PM|am|pm)?))?/;
  m = sel.match(regex2);
  if (m) {
    const candidate = (m[1] + " " + (m[2] || "")).trim();
    d = new Date(candidate);
    if (!isNaN(d.getTime())) return d;
  }

  // Try extract numbers and guess (dd/mm/yyyy or mm/dd/yyyy)
  const nums = sel.match(/\d{1,4}/g);
  if (nums && nums.length >= 3) {
    const a = nums.map((n) => parseInt(n, 10));
    const year = a.find((x) => x > 31) || a[a.length - 1];
    const others = a.filter((x) => x !== year);
    if (others.length >= 2) {
      const month = others[0];
      const day = others[1];
      d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

// Calculate time difference in milliseconds
function timeDiffMs(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  const diffMs = b - a;
  if (isNaN(diffMs)) return null;
  return diffMs;
}

// Handle messages from popup/settings
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Add message handlers here if needed
});

// Cleanup on unload
self.addEventListener("unload", () => {
  try {
    chrome.contextMenus.removeAll();
  } catch (e) {
    console.error('Cleanup error:', e);
  }
});
