function formatDuration(ms) {
    if (!ms) return "-";
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
  
    if (hr > 0) return `${hr}h ${min % 60}m`;
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  }

function formatMDY(dateIso) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  if (isNaN(d)) return "-";

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear().toString().slice(-2);
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");

  return `${month}/${day}/${year} ${hours}:${mins}`;
}

  async function loadIncidents() {
    chrome.storage.local.get(null, data => {
      const table = document.getElementById("incidentTable");
      table.innerHTML = "";
  
      Object.values(data).forEach(inc => {
        // Ignore non-incident metadata entries (e.g. _currentIncident)
        if (!inc || !inc.incidentNumber) return;

        const row = document.createElement("tr");
  
        const occ = formatMDY(inc.eventOccurrence);
        const det = formatMDY(inc.eventDetection);
        const res = formatMDY(inc.eventResolve);

  
        const mttd = inc.mttd ? formatDuration(inc.mttd) : "-";
        const mttr = inc.mttr ? formatDuration(inc.mttr) : "-";
  
        row.innerHTML = `
          <td>${inc.incidentNumber}</td>
          <td>${occ}</td>
          <td>${det}</td>
          <td>${res}</td>
          <td>${mttd}</td>
          <td>${mttr}</td>
        `;
  
        table.appendChild(row);
      });
    });
  }
  
  document.getElementById("clearAll").addEventListener("click", () => {
    chrome.storage.local.clear(() => {
      loadIncidents();
    });
  });
  
  document.getElementById("exportCsv").addEventListener("click", () => {
    chrome.storage.local.get(null, data => {
      if (!Object.keys(data).length) return;

      let csv = "Incident,Occurrence,Detection,Resolve,MTTD(ms),MTTR(ms)\n";

      Object.values(data).forEach(inc => {
        if (!inc || !inc.incidentNumber) return;

        csv += `${inc.incidentNumber},` +
          `${inc.eventOccurrence || ""},` +
          `${inc.eventDetection || ""},` +
          `${inc.eventResolve || ""},` +
          `${inc.mttd || ""},` +
          `${inc.mttr || ""}\n`;
      });

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "incidents.csv";
      a.click();
    });
  });

  // Open settings button
  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  loadIncidents();
  
