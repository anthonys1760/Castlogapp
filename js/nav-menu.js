(function () {
  var nav = document.querySelector("nav");
  var btn = document.getElementById("nav-menu-btn");
  var backdrop = document.getElementById("nav-backdrop");
  if (!nav || !btn) return;

  function setOpen(open) {
    document.body.classList.toggle("menu-open", open);
    nav.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (backdrop) backdrop.hidden = !open;
  }

  btn.addEventListener("click", function () {
    setOpen(!nav.classList.contains("menu-open"));
  });
  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }
  nav.querySelectorAll(".nav-links a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
})();
