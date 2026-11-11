(function () {
  var SELECTOR = 'a[href*="apps.apple.com"]';

  function inferredPlacement(anchor) {
    if (anchor.closest("footer")) return "footer";
    if (anchor.closest(".nav-mobile, .mobile-nav, #nav-mobile, [data-nav='mobile']")) {
      return "nav_mobile";
    }
    if (anchor.closest("header, nav")) return "header";
    if (anchor.id === "hero-store" || anchor.closest(".hero, .hero-ctas, #hero")) return "hero";
    if (anchor.id === "post-cta-ios" || anchor.closest("section.cta, .post-cta")) return "blog_cta";
    if (anchor.id === "cta-ios") return "download_page";

    var path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/get" || path === "/download") return "download_page";

    var medium = "";
    try {
      medium = new URL(anchor.href, window.location.href).searchParams.get("utm_medium") || "";
    } catch (err) {
      medium = "";
    }
    if (medium === "hero_cta") return "hero";
    if (medium === "final_cta") return "final_cta";
    if (medium === "blog_post") return "blog_cta";
    if (medium === "support_faq") return "support_faq";
    if (medium) return medium.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();

    return "app_store";
  }

  function placementFor(anchor) {
    var explicit = anchor.getAttribute("data-placement");
    if (explicit && explicit.trim()) return explicit.trim();
    return inferredPlacement(anchor);
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      target = target && target.parentElement;
    }
    if (!target || typeof target.closest !== "function") return;

    var anchor = target.closest(SELECTOR);
    if (!anchor) return;
    if (typeof window.gtag !== "function") return;

    window.gtag("event", "app_store_click", {
      link_url: anchor.href,
      placement: placementFor(anchor),
      transport_type: "beacon"
    });
  });
})();
