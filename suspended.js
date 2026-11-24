const params = new URLSearchParams(window.location.search);
const originalUrl = params.get("url") || "";
const originalTitle = params.get("title") || originalUrl || "Suspended Tab";
const favIconUrl = params.get("favIconUrl") || "";

const isSafeHttpUrl =
  originalUrl.startsWith("http://") || originalUrl.startsWith("https://");

document.title = `Suspended: ${originalTitle}`;
document.getElementById("pageTitle").innerText = originalTitle;
document.getElementById("pageUrl").innerText = originalUrl;

const faviconEl = document.getElementById("favicon");
if (favIconUrl && (favIconUrl.startsWith("http://") || favIconUrl.startsWith("https://"))) {
  faviconEl.src = favIconUrl;
  faviconEl.style.display = "block";
}

function reloadOriginalTab() {
  if (isSafeHttpUrl) {
    window.location.replace(originalUrl);
  }
}

document.getElementById("reloadBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  reloadOriginalTab();
});

document.body.addEventListener("click", () => {
  reloadOriginalTab();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    reloadOriginalTab();
  }
});
