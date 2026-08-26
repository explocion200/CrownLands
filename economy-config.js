window.CROWNLANDS_ECONOMY_CONFIG = {
  "schemaVersion": 1,
  "updatedAt": "2026-08-13T15:39:28.235Z",
  "shopItems": {
    "shield_12h": {
      "cost": 1250000,
      "dailyPurchaseLimit": 1,
      "effectDurationMinutes": 720
    },
    "war_drums_30m": {
      "cost": 100000,
      "dailyPurchaseLimit": 4,
      "effectDurationMinutes": 30,
      "bonusPercent": 30
    },
    "royal_tax_decree_30m": {
      "cost": 100000,
      "dailyPurchaseLimit": 5,
      "effectDurationMinutes": 30,
      "bonusPercent": 50
    },
    "veil_of_silence_30m": {
      "cost": 125000,
      "dailyPurchaseLimit": 5,
      "effectDurationMinutes": 5
    },
    "swift_march_order": {
      "cost": 300000,
      "dailyPurchaseLimit": 5
    },
    "recall_horn": {
      "cost": 500000,
      "dailyPurchaseLimit": 2
    }
  },
  "dailyLoginRewards": {
    "schemaVersion": 3,
    "maxPendingRewards": 2,
    "itemOrder": [
      "war_drums_30m",
      "veil_of_silence_30m",
      "royal_tax_decree_30m",
      "swift_march_order",
      "recall_horn",
      "shield_12h"
    ],
    "tracksByMonthLength": {
      "28": {
        "itemDays": [
          5,
          9,
          14,
          19,
          23,
          28
        ],
        "goldHours": [
          3,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ],
        "troopHours": [
          3,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ]
      },
      "29": {
        "itemDays": [
          5,
          10,
          15,
          19,
          24,
          29
        ],
        "goldHours": [
          1,
          2,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ],
        "troopHours": [
          3,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ]
      },
      "30": {
        "itemDays": [
          5,
          10,
          15,
          20,
          25,
          30
        ],
        "goldHours": [
          1,
          2,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ],
        "troopHours": [
          1,
          2,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ]
      },
      "31": {
        "itemDays": [
          5,
          10,
          16,
          21,
          26,
          31
        ],
        "goldHours": [
          1,
          2,
          3,
          4,
          5,
          6,
          8,
          10,
          10,
          10,
          12,
          16,
          24
        ],
        "troopHours": [
          1,
          2,
          3,
          4,
          5,
          6,
          8,
          10,
          12,
          16,
          20,
          24
        ]
      }
    }
  },
  "pickups": {
    "initialSpawnDelayMinutes": 3,
    "respawnAfterCollectionMinutes": 1,
    "expireMinutes": 20,
    "goldAwardProductionMinutes": 60,
    "troopAwardProductionMinutes": 60,
    "dailyTotalCap": 50,
    "dailyGoldCap": 25,
    "dailyTroopCap": 25,
    "maxActivePerPlayer": 1,
    "minimumGold": 250,
    "minimumTroops": 250
  },
  "cityEconomy": {
    "productionVpBase": 20,
    "productionVpGrowth": 1.115,
    "goldPerProductionVp": 15,
    "goldEndgameStartLevel": 100,
    "goldEndgameGrowth": 1.08,
    "troopsPerVictoryPoint": 10,
    "wallDefenseBase": 200,
    "wallDefensePerLevel": 28858,
    "upgradeEarlyEndLevel": 50,
    "upgradeMidEndLevel": 100,
    "upgradeEarlyStartHours": 0.1,
    "upgradeEarlyEndHours": 4,
    "upgradeMidEndHours": 36,
    "upgradeLevel150Hours": 240,
    "upgradeMaximumHours": 720
  },
  "troopCombat": {
    "defenseModelVersion": 1,
    "baseAttackPowerPerTroop": 1.25,
    "baseDefensePowerPerTroop": 1.3
  },
  "siegeCombat": {
    "modelVersion": 1,
    "repairBaseMinutes": 15,
    "repairMinutesPerLevel": 0.3,
    "meaningfulWallDamagePercent": 5,
    "intactWallDefenderLossCapPercent": 10
  },
  "playerCosts": {
    "nearbyScoutGold": 250000,
    "regroupGold": 250000,
    "skillResetGold": 1000000,
    "skillPresetApplyGold": 1000000
  },
  "skills": {
    "swordmastery": {
      "percentPerLevel": 2,
      "maxPercent": 60
    },
    "shieldwallDiscipline": {
      "percentPerLevel": 2,
      "maxPercent": 60
    },
    "stoneworks": {
      "percentPerLevel": 3,
      "maxPercent": 75
    },
    "taxStewardship": {
      "percentPerLevel": 3,
      "maxPercent": 75
    },
    "royalGranaries": {
      "percentPerLevel": 3,
      "maxPercent": 75
    },
    "guildCharters": {
      "percentPerLevel": 2,
      "maxPercent": 50
    },
    "marchOrders": {
      "percentPerLevel": 3,
      "maxPercent": 60
    },
    "fieldMedics": {
      "percentPerLevel": 2,
      "maxPercent": 50
    }
  },
  "levelRewards": {
    "goldFloorBase": 500,
    "goldFloorPerLevel": 250,
    "goldFloorExponent": 1.25,
    "goldFloorExponentScale": 40,
    "goldEarlyUpgradeShare": 0.75,
    "goldMidUpgradeShare": 0.4,
    "goldEndgameUpgradeShare": 0.4,
    "goldEarlyProductionHours": 6,
    "goldMidProductionHours": 16,
    "goldEndgameProductionHours": 36,
    "troopEarlyBaseHours": 4,
    "troopEarlyHoursPerLevel": 0.4,
    "troopMidBaseHours": 24,
    "troopMidHoursPerLevel": 0.6,
    "troopEndgameBaseHours": 54,
    "troopEndgameHoursPerLevel": 0.4,
    "troopMaximumHours": 108
  },
  "cityUpgradeXp": {
    "enabled": true,
    "modelVersion": 1,
    "legacyRequestsEnabled": true,
    "fixedXpRate": 0.05,
    "capStartHeroLevel": 50,
    "capMaximumHeroLevel": 100,
    "capStartLevelEquivalents": 1,
    "capMaximumLevelEquivalents": 2
  },
  "camps": {
    "gold": {
      "holdMinutes": 10,
      "baseDefenders": 20000,
      "rewardSchedule": [
        {
          "minimumReward": 20000,
          "productionHours": 0.5
        },
        {
          "minimumReward": 40000,
          "productionHours": 1
        },
        {
          "minimumReward": 60000,
          "productionHours": 1.5
        },
        {
          "minimumReward": 80000,
          "productionHours": 2
        }
      ]
    },
    "troops": {
      "holdMinutes": 15,
      "baseDefenders": 20000,
      "rewardSchedule": [
        {
          "minimumReward": 10000,
          "productionHours": 0.5
        },
        {
          "minimumReward": 20000,
          "productionHours": 1
        },
        {
          "minimumReward": 30000,
          "productionHours": 1.5
        },
        {
          "minimumReward": 40000,
          "productionHours": 2
        }
      ]
    },
    "items": {
      "holdMinutes": 30,
      "baseDefenders": 20000,
      "maxDailyRewards": 5
    },
    "deed": {
      "holdMinutes": 60,
      "baseDefenders": 20000,
      "maxDailyRewards": 1
    }
  }
};
