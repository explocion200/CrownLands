(function(root){
  "use strict";
  const data = {
  "version": "guild-missions-2",
  "types": {
    "guard": {
      "name": "Guard",
      "base": [
        12,
        6,
        6,
        8,
        10
      ],
      "growth": [
        3,
        1,
        1,
        2,
        2
      ],
      "skill": "Hold the line",
      "hazard": "ambush",
      "trait": "Roadwise"
    },
    "scout": {
      "name": "Scout",
      "base": [
        6,
        12,
        8,
        6,
        10
      ],
      "growth": [
        1,
        3,
        2,
        1,
        2
      ],
      "skill": "Find safe passage",
      "hazard": "wilderness",
      "trait": "Pathfinder"
    },
    "scholar": {
      "name": "Scholar",
      "base": [
        6,
        8,
        12,
        10,
        6
      ],
      "growth": [
        1,
        2,
        3,
        2,
        1
      ],
      "skill": "Read the signs",
      "hazard": "investigation",
      "trait": "Meticulous"
    },
    "artisan": {
      "name": "Artisan",
      "base": [
        10,
        8,
        12,
        6,
        6
      ],
      "growth": [
        2,
        2,
        3,
        1,
        1
      ],
      "skill": "Field repairs",
      "hazard": "engineering",
      "trait": "Tinkerer"
    },
    "envoy": {
      "name": "Envoy",
      "base": [
        6,
        8,
        10,
        12,
        6
      ],
      "growth": [
        1,
        2,
        2,
        3,
        1
      ],
      "skill": "Find common ground",
      "hazard": "negotiation",
      "trait": "Diplomatic"
    },
    "quartermaster": {
      "name": "Quartermaster",
      "base": [
        8,
        6,
        10,
        6,
        12
      ],
      "growth": [
        2,
        1,
        2,
        1,
        3
      ],
      "skill": "Ready provisions",
      "hazard": "supplies",
      "trait": "Prepared"
    },
    "medic": {
      "name": "Medic",
      "base": [
        6,
        8,
        12,
        6,
        10
      ],
      "growth": [
        1,
        2,
        3,
        1,
        2
      ],
      "skill": "A steady hand",
      "hazard": "treatment",
      "trait": "Prepared"
    }
  },
  "stats": [
    "Strength",
    "Agility",
    "Knowledge",
    "Leadership",
    "Endurance"
  ],
  "portraits": [
    {
      "id": "common-guard-01",
      "type": "guard",
      "name": "Mara Stone",
      "alt": "Stern, lean watchwoman with a braid, wooden cudgel and plain plank shield."
    },
    {
      "id": "common-guard-02",
      "type": "guard",
      "name": "Maren Holt",
      "alt": "Gaunt older watchman in patched linen carrying a farm billhook."
    },
    {
      "id": "common-guard-03",
      "type": "guard",
      "name": "Elin Ward",
      "alt": "Stern young farmhand with a patched waistcoat and two-pronged hayfork."
    },
    {
      "id": "common-scout-01",
      "type": "scout",
      "name": "Rowan Ashford",
      "alt": "Wary, wiry poacher with a plain hunting bow, three arrows and snare cord."
    },
    {
      "id": "common-scout-02",
      "type": "scout",
      "name": "Finn Alder",
      "alt": "Lean shepherd with a cloth cap, ash staff and braided sling."
    },
    {
      "id": "common-scout-03",
      "type": "scout",
      "name": "Tomas Reed",
      "alt": "Thin woodland trapper with a billhook, coiled snares and frayed shoulder cape."
    },
    {
      "id": "common-scholar-01",
      "type": "scholar",
      "name": "Hugh Rook",
      "alt": "Gaunt older scribe with a knotted staff and small wooden-framed slate."
    },
    {
      "id": "common-scholar-02",
      "type": "scholar",
      "name": "Ansel Dale",
      "alt": "Stern young clerk with a wooden club, worn booklet and goose quill."
    },
    {
      "id": "common-scholar-03",
      "type": "scholar",
      "name": "Bren Moss",
      "alt": "Lean traveling copyist with a quarterstaff and cord-tied parchment."
    },
    {
      "id": "common-artisan-01",
      "type": "artisan",
      "name": "Elin Marsh",
      "alt": "Lean, stern carpenter in a work cap holding a wooden mallet."
    },
    {
      "id": "common-artisan-02",
      "type": "artisan",
      "name": "Walt Fen",
      "alt": "Wiry older woodcutter with a gray mustache, repaired apron and plain hatchet."
    },
    {
      "id": "common-artisan-03",
      "type": "artisan",
      "name": "Ned Pike",
      "alt": "Stern young repair worker with a plain work hammer and cloth tool roll."
    },
    {
      "id": "common-envoy-01",
      "type": "envoy",
      "name": "Ada Vale",
      "alt": "Stern, lean village messenger with a patched shawl, staff and tied letter."
    },
    {
      "id": "common-envoy-02",
      "type": "envoy",
      "name": "Tom Barley",
      "alt": "Thin older spokesman with an untidy gray beard, cudgel and sealed note."
    },
    {
      "id": "common-envoy-03",
      "type": "envoy",
      "name": "Merrick Wren",
      "alt": "Stern, lean red-haired courier with a staff and patched message pouch."
    },
    {
      "id": "common-quartermaster-01",
      "type": "quartermaster",
      "name": "Bram Cask",
      "alt": "Lean storeyard porter with a cudgel, provision sack and tally stick."
    },
    {
      "id": "common-quartermaster-02",
      "type": "quartermaster",
      "name": "Edwin Sack",
      "alt": "Wiry grain carter with a cloth cap, hay hook and grain sack."
    },
    {
      "id": "common-quartermaster-03",
      "type": "quartermaster",
      "name": "Jory Dunn",
      "alt": "Lanky pack handler holding a wagon-peg club with rope and a rolled blanket."
    },
    {
      "id": "common-medic-01",
      "type": "medic",
      "name": "Ione Holt",
      "alt": "Stern, thin older healer with a staff, dried herbs and linen bandages."
    },
    {
      "id": "common-medic-02",
      "type": "medic",
      "name": "Perrin Herb",
      "alt": "Lean herbalist with a wooden club, herb pouch and small wooden mortar."
    },
    {
      "id": "common-medic-03",
      "type": "medic",
      "name": "Lukas Brook",
      "alt": "Stern, skinny caregiver with a quarterstaff, bandage roll and herb basket."
    }
  ],
  "ceilings": [
    20,
    40,
    60,
    80,
    100
  ],
  "rarities": [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary"
  ],
  "traits": {
    "Roadwise": "ambush",
    "Pathfinder": "wilderness",
    "Meticulous": "investigation",
    "Tinkerer": "engineering",
    "Diplomatic": "negotiation",
    "Prepared": "supplies"
  },
  "tiers": [
    {
      "name": "Local",
      "guild": 1,
      "members": 2,
      "target": 24,
      "risk": 20,
      "hours": [
        1,
        2
      ]
    },
    {
      "name": "Established",
      "guild": 25,
      "members": 2,
      "target": 70,
      "risk": 25,
      "hours": [
        2,
        4
      ]
    },
    {
      "name": "Demanding",
      "guild": 50,
      "members": 3,
      "target": 210,
      "risk": 30,
      "hours": [
        4
      ]
    },
    {
      "name": "Dangerous",
      "guild": 75,
      "members": 4,
      "target": 480,
      "risk": 35,
      "hours": [
        4,
        8
      ]
    },
    {
      "name": "Exceptional",
      "guild": 100,
      "members": 4,
      "target": 720,
      "risk": 40,
      "hours": [
        8
      ]
    }
  ],
  "routes": {
    "direct": {
      "time": 1,
      "risk": 0,
      "reward": 1
    },
    "patrolled": {
      "time": 1.25,
      "risk": -6,
      "reward": 0.9
    },
    "remote": {
      "time": 0.8,
      "risk": 8,
      "reward": 1.15
    }
  },
  "approaches": {
    "cautious": {
      "time": 1.2,
      "risk": -6,
      "reward": 0.9
    },
    "balanced": {
      "time": 1,
      "risk": 0,
      "reward": 1
    },
    "bold": {
      "time": 0.9,
      "risk": 6,
      "reward": 1.1
    }
  },
  "missions": [
    {
      "id": "escort",
      "name": "The Merchant's Road",
      "client": "Miller's Caravan",
      "kind": "Gold",
      "primary": 0,
      "secondary": 4,
      "hazard": "ambush",
      "hours": 2,
      "copy": "Escort a supply wagon through the western woods. Guards keep the caravan safe when the road narrows.",
      "rewardKind": "gold",
      "resources": []
    },
    {
      "id": "muster",
      "name": "The Village Muster",
      "client": "Reeve of Alderwick",
      "kind": "Troops",
      "primary": 3,
      "secondary": 4,
      "hazard": "negotiation",
      "hours": 2,
      "copy": "Visit the villages and bring willing recruits home. A capable Envoy can earn the reeve's trust.",
      "rewardKind": "troops",
      "resources": []
    },
    {
      "id": "equipment",
      "name": "The Lost Quartermaster",
      "client": "Royal Stores",
      "kind": "Officer Gear",
      "primary": 2,
      "secondary": 1,
      "hazard": "engineering",
      "hours": 8,
      "copy": "Search for the missing supply chest. Artisans recognize what can be recovered and carried safely.",
      "rewardKind": "gear",
      "resources": []
    },
    {
      "id": "quarry",
      "name": "Survey the White Quarry",
      "client": "Stonecutters' Company",
      "kind": "Stone",
      "primary": 2,
      "secondary": 4,
      "hazard": "engineering",
      "hours": 2,
      "copy": "Survey a weathered face above the quarry and mark a safe route for the stonecutters.",
      "rewardKind": "materials",
      "resources": [
        "stone"
      ]
    },
    {
      "id": "timber",
      "name": "The Western Timber Road",
      "client": "Woodland Foresters",
      "kind": "Timber",
      "primary": 1,
      "secondary": 4,
      "hazard": "wilderness",
      "hours": 2,
      "copy": "Find a dependable route through the old woods. Scouts help the foresters bring timber home.",
      "rewardKind": "materials",
      "resources": [
        "timber",
        "planks"
      ]
    },
    {
      "id": "workshop",
      "name": "The Missing Workshop Wagon",
      "client": "Artisans' Company",
      "kind": "Iron",
      "primary": 4,
      "secondary": 2,
      "hazard": "supplies",
      "hours": 2,
      "copy": "Recover tools and iron from a stalled wagon before the woodland track becomes impassable.",
      "rewardKind": "materials",
      "resources": [
        "iron",
        "tools"
      ]
    },
    {
      "id": "waymark",
      "name": "The Forgotten Waymark",
      "client": "Guild Cartographers",
      "kind": "Discovery",
      "primary": 1,
      "secondary": 2,
      "hazard": "wilderness",
      "hours": 1,
      "copy": "Follow the marks on an old milestone. A forgotten path may connect places absent from the Guild's maps.",
      "rewardKind": "discovery",
      "resources": []
    },
    {
      "id": "ledger",
      "name": "The Sealed Ledger",
      "client": "Alderwick Archivist",
      "kind": "Story chapter",
      "primary": 2,
      "secondary": 3,
      "hazard": "investigation",
      "hours": 2,
      "copy": "Trace a name through abandoned records. Scholars may uncover why the northern watchtower was deserted.",
      "rewardKind": "discovery",
      "resources": []
    }
  ]
};
  if(typeof module === "object" && module.exports)module.exports=data;else root.CrownlandsGuildConfig=data;
})(globalThis);
