(function (global) {
  "use strict";
  function mount(host, tower, options = {}) {
    global.CrownlandsClanTowerBuildingsUi.mountPendingMechanics(host, tower, "infirmary", options);
  }
  global.CrownlandsInfirmaryUi = Object.freeze({ mount });
})(window);
