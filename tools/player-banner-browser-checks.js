"use strict";

// Runs inside the actual game document. Detect clipped/missing crests, including
// SVG intrinsic sizing that can overflow an otherwise correctly sized banner.
module.exports = function inspectPlayerBanners(root) {
  const banners = [...root.querySelectorAll(".player-banner")].filter(node => node.getBoundingClientRect().width > 0);
  const reference = document.querySelector("#profileScreen.profile-ledger-active #profileKingdomFlag");
  const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1
    && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  return banners.map(mount => {
    const flag = mount.querySelector(".kingdom-flag"), symbol = flag?.querySelector(".flag-symbol svg");
    if (!flag || !symbol) return "missing flag or crest";
    const box = flag.getBoundingClientRect(), crest = symbol.getBoundingClientRect();
    if (!contains(mount.getBoundingClientRect(), box) || !contains(box, crest)) return "clipped flag or crest";
    if (crest.width < box.width * .5 || crest.height > box.height * .82) return "incorrect crest scale";
    const rod = mount.querySelector(".banner-rod");
    if (!rod || !contains(mount.getBoundingClientRect(), rod.getBoundingClientRect())) return "clipped or missing mount";
    if (reference && getComputedStyle(flag).clipPath !== getComputedStyle(reference).clipPath) return "different profile banner shape";
    return "ok";
  });
};
