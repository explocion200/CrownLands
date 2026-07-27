window.CROWNLANDS_ECONOMY_CONFIG = {
  "schemaVersion": 1,
  "updatedAt": "2026-07-27T05:39:59.562Z",
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
    "schemaVersion": 1,
    "cycleLengthDays": 30,
    "days": [
      { "day": 1, "goldHours": 0.5, "troopHours": 0, "items": {} },
      { "day": 2, "goldHours": 0, "troopHours": 0.5, "items": {} },
      { "day": 3, "goldHours": 1, "troopHours": 0, "items": {} },
      { "day": 4, "goldHours": 0, "troopHours": 1, "items": {} },
      { "day": 5, "goldHours": 1.5, "troopHours": 1.5, "items": { "war_drums_30m": 1 } },
      { "day": 6, "goldHours": 2, "troopHours": 0, "items": {} },
      { "day": 7, "goldHours": 0, "troopHours": 2, "items": {} },
      { "day": 8, "goldHours": 2.5, "troopHours": 0, "items": {} },
      { "day": 9, "goldHours": 0, "troopHours": 2.5, "items": {} },
      { "day": 10, "goldHours": 3, "troopHours": 3, "items": { "veil_of_silence_30m": 1 } },
      { "day": 11, "goldHours": 3.5, "troopHours": 0, "items": {} },
      { "day": 12, "goldHours": 0, "troopHours": 3.5, "items": {} },
      { "day": 13, "goldHours": 4, "troopHours": 0, "items": {} },
      { "day": 14, "goldHours": 0, "troopHours": 4, "items": {} },
      { "day": 15, "goldHours": 4.5, "troopHours": 4.5, "items": { "war_drums_30m": 1, "royal_tax_decree_30m": 1 } },
      { "day": 16, "goldHours": 5, "troopHours": 0, "items": {} },
      { "day": 17, "goldHours": 0, "troopHours": 5, "items": {} },
      { "day": 18, "goldHours": 5.5, "troopHours": 0, "items": {} },
      { "day": 19, "goldHours": 0, "troopHours": 5.5, "items": {} },
      { "day": 20, "goldHours": 6, "troopHours": 6, "items": { "royal_tax_decree_30m": 1, "swift_march_order": 1 } },
      { "day": 21, "goldHours": 7, "troopHours": 0, "items": {} },
      { "day": 22, "goldHours": 0, "troopHours": 7, "items": {} },
      { "day": 23, "goldHours": 8, "troopHours": 0, "items": {} },
      { "day": 24, "goldHours": 0, "troopHours": 8, "items": {} },
      { "day": 25, "goldHours": 9, "troopHours": 9, "items": { "veil_of_silence_30m": 1, "swift_march_order": 1, "recall_horn": 1 } },
      { "day": 26, "goldHours": 9.5, "troopHours": 0, "items": {} },
      { "day": 27, "goldHours": 0, "troopHours": 10, "items": {} },
      { "day": 28, "goldHours": 10.5, "troopHours": 0, "items": {} },
      { "day": 29, "goldHours": 0, "troopHours": 11, "items": {} },
      {
        "day": 30,
        "goldHours": 12,
        "troopHours": 12,
        "items": {
          "shield_12h": 1,
          "war_drums_30m": 1,
          "royal_tax_decree_30m": 1,
          "veil_of_silence_30m": 1,
          "swift_march_order": 1,
          "recall_horn": 1
        }
      }
    ]
  },
  "pickups": {
    "spawnIntervalMinutes": 3,
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
    "defensePercentPerLevel": 2,
    "wallDefenseBase": 200,
    "wallDefenseExponent": 3,
    "wallDefenseScale": 3,
    "upgradeEarlyEndLevel": 50,
    "upgradeMidEndLevel": 100,
    "upgradeEarlyStartHours": 0.1,
    "upgradeEarlyEndHours": 4,
    "upgradeMidEndHours": 36,
    "upgradeLevel150Hours": 240,
    "upgradeMaximumHours": 720
  },
  "playerCosts": {
    "nearbyScoutGold": 250000,
    "regroupGold": 250000,
    "skillResetGold": 1000000
  },
  "skills": {
    "swordmastery": {
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
    "goldEarlyUpgradeShare": 0.5,
    "goldMidUpgradeShare": 0.3,
    "goldEndgameUpgradeShare": 0.2,
    "goldEarlyProductionHours": 4,
    "goldMidProductionHours": 12,
    "goldEndgameProductionHours": 24,
    "troopEarlyBaseHours": 4,
    "troopEarlyHoursPerLevel": 0.4,
    "troopMidBaseHours": 24,
    "troopMidHoursPerLevel": 0.24,
    "troopEndgameBaseHours": 36,
    "troopEndgameHoursPerLevel": 0.12,
    "troopMaximumHours": 48
  },
  "camps": {
    "gold": {
      "holdMinutes": 10,
      "baseDefenders": 10000,
      "defenseLevel": 30,
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
      "baseDefenders": 10000,
      "defenseLevel": 30,
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
      "baseDefenders": 10000,
      "defenseLevel": 30,
      "maxDailyRewards": 5
    },
    "deed": {
      "holdMinutes": 60,
      "baseDefenders": 25000,
      "defenseLevel": 30,
      "maxDailyRewards": 1
    }
  }
};
