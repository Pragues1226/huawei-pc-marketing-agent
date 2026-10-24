// The full workbench needs its local Python server, even for the cover screen.
if (window.location.protocol === "file:") {
  window.location.replace(new URL("../../START.html", window.location.href).href);
}
