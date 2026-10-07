# Tiny City Estate review

This development-only page mounts the production estate renderer with three visual fixtures: the initial six buildings and fourteen surveyed plots, all twenty completed buildings, and all twenty construction sites. It cannot spend resources, start construction, change saved progression or dispatch champions. The production package excludes this page and its controls.

Run `node tools/map-benchmark/server.js --port=8816` from the feature checkout and open `http://127.0.0.1:8816/docs/visual-qa/inner-city-estate/index.html`. The bottom-right selector switches the scene. Pan, pinch/wheel zoom, Fit Estate, district navigation and the twenty-building directory use the production implementation. The map is 1448 × 1086, matching normal regional maps. All animation preferences display the still estate; characters and ambient motion are deferred.

The real-game integration test runs `node tools/validate-inner-castle-browser.js` against the private benchmark runtime. It exercises all twenty selections at 1440×900, 844×390 and 568×320, twelve gear round trips, camera restoration, 44px nonoverlapping targets, mouse drag, wheel and touch pinch, zoom bounds, Full/Reduced/Off, background visibility, city/Profile entry and modal cleanup. Screenshots go to ignored `release-artifacts/inner-city-estate/`.

`node tools/validate-inner-city-estate.js` checks the approved coordinates, reserved footprints, connected road graph, every entrance, road/plot collisions, initial states and compact runtime artwork. `node tools/validate-inner-castle.js` and `node tools/validate-common-gear.js` retain access, legacy artwork and authoritative gear checks. Production artifact validation verifies every new runtime file is packaged.

Review the common building scale, miniature silhouettes, thin brown outlines, olive/ochre/pale-stone palette, worn painted roads, Gatehouse wall connectors and the construction artwork. Roads, masonry and decorative cottages belong to the ground painting; no geometric road/wall layers sit over it. Browser automation verifies that completed artwork fits its reservation without stretching, no ambient actors or animation loops exist, and controls work at the three viewport sizes. Actual-device touch feel can also be reviewed without changing the artwork contract.

The Master Specification and Art Bible contain the approved design. Nothing in this review establishes deployment.
