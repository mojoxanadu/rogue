// ============================================================
//  ITEMS REGISTRY  –  src/items_registry.js
//
//  Builds the global ItemDefs map (camelCase name → ItemDef) from
//  the LEGACY_ITEM_DATA table in state.js. ItemDefs is the only
//  runtime registry game code should read — LEGACY_ITEM_DATA is
//  source-data, not a registry, and exists only to feed this
//  builder. Eventual goal: hand-port each LEGACY_ITEM_DATA entry
//  into a `new ItemDef({...})` here directly, after which the
//  legacy table can be deleted.
//
//  Must be concatenated AFTER state.js (which declares
//  LEGACY_ITEM_DATA) and items.js (which defines the ItemDef class).
// ============================================================

const ItemDefs = {};

// ─── Auto-generated from LEGACY_ITEM_DATA ──────────────────
// Do not edit manually — regenerate via util/migrate_items.py

ItemDefs.arrows = new ItemDef({
  name: 'arrows',
  displayName: 'Arrows',
  icon: '➶',
  maxGP: 1,
  maxStack: 99,
  stackable: true,
  type: 'ammo'
});

ItemDefs.aegisOfChampions = new ItemDef({
  name: 'aegisOfChampions',
  displayName: 'Aegis of Champions',
  icon: '🛡️🌟',
  evadePercent: 30,
  maxGP: 15000,
  slot: 'chest',
  stackable: false,
  type: 'armor',
  equipGroups: [['chest']]
});

ItemDefs.bootsOfBlindingSpeed = new ItemDef({
  name: 'bootsOfBlindingSpeed',
  displayName: 'Boots of Blinding Speed',
  icon: '👢⚡',
  evadePercent: 50,
  maxGP: 1000,
  slot: 'feet',
  stackable: false,
  type: 'armor',
  equipGroups: [['feet']]
});

ItemDefs.briefs = new ItemDef({
  name: 'briefs',
  displayName: 'Briefs',
  icon: '🩲',
  evadePercent: 0,
  maxGP: 2,
  slot: 'legs',
  stackable: false,
  type: 'armor',
  equipGroups: [['legs']]
});

ItemDefs.colanderOfTheFaithful = new ItemDef({
  name: 'colanderOfTheFaithful',
  displayName: 'Colander of the Faithful',
  icon: '🧢',
  evadePercent: 0,
  maxGP: 1,
  slot: 'head',
  stackable: false,
  type: 'armor',
  equipGroups: [['head']]
});

ItemDefs.crownOfNoodlyAppendages = new ItemDef({
  name: 'crownOfNoodlyAppendages',
  displayName: 'Crown of Noodly Appendages',
  icon: '👑',
  evadePercent: 5,
  maxGP: 500,
  slot: 'head',
  stackable: false,
  type: 'armor',
  equipGroups: [['head']]
});

ItemDefs.crownOfThorns = new ItemDef({
  name: 'crownOfThorns',
  displayName: 'Crown of Thorns',
  icon: '👑🌿',
  evadePercent: 5,
  maxGP: 10000,
  slot: 'head',
  stackable: false,
  thornsDmg: 5,
  type: 'armor',
  equipGroups: [['head']]
});

ItemDefs.masqueOfClavicusVile = new ItemDef({
  name: 'masqueOfClavicusVile',
  displayName: 'Masque of Clavicus Vile',
  icon: '👺',
  evadePercent: 5,
  maxGP: 50000,
  slot: 'head',
  stackable: false,
  type: 'armor',
  equipGroups: [['head']]
});

ItemDefs.oldBoot = new ItemDef({
  name: 'oldBoot',
  displayName: 'Old Boot',
  icon: '🥾',
  defenseBonus: 2,
  evadePercent: 0,
  maxGP: 2,
  slot: 'feet',
  stackable: false,
  type: 'armor',
  equipGroups: [['feet']]
});

ItemDefs.fightersBoots = new ItemDef({
  name: 'fightersBoots',
  displayName: 'Fighter\'s Boots',
  icon: '👠',
  defenseBonus: 4,
  evadePercent: 5,
  maxGP: 75,
  slot: 'feet',
  stackable: false,
  type: 'armor',
  equipGroups: [['feet']]
});

ItemDefs.ringOfEvasion = new ItemDef({
  name: 'ringOfEvasion',
  displayName: 'Ring of Evasion',
  icon: '💍⚡',
  evadePercent: 20,
  maxGP: 5000,
  slot: 'rightHand',
  stackable: false,
  type: 'armor',
  equipGroups: [['rightHand']]
});

ItemDefs.ringOfMidas = new ItemDef({
  name: 'ringOfMidas',
  displayName: 'Ring of Midas',
  icon: '💍',
  evadePercent: -20,
  maxGP: 500,
  slot: 'rightHand',
  stackable: false,
  type: 'armor',
  equipGroups: [['rightHand']]
});

ItemDefs.robe = new ItemDef({
  name: 'robe',
  displayName: 'Robe',
  icon: '🥻',
  evadePercent: 0,
  intBonus: 1,
  maxGP: 30,
  slot: 'chest',
  stackable: false,
  type: 'armor',
  equipGroups: [['chest']]
});

ItemDefs.scarf = new ItemDef({
  name: 'scarf',
  displayName: 'Scarf',
  icon: '🧣',
  defenseBonus: 1,
  evadePercent: 2,
  maxGP: 15,
  slot: 'chest',
  stackable: false,
  type: 'armor',
  equipGroups: [['chest']]
});

ItemDefs.runningShirt = new ItemDef({
  name: 'runningShirt',
  displayName: 'Running Shirt',
  icon: '🎽',
  evadePercent: 0,
  maxGP: 2,
  slot: 'chest',
  stackable: false,
  type: 'armor',
  equipGroups: [['chest']]
});

ItemDefs.sandals = new ItemDef({
  name: 'sandals',
  displayName: 'Sandals',
  icon: '🩴',
  evadePercent: 0,
  maxGP: 2,
  slot: 'feet',
  stackable: false,
  type: 'armor',
  equipGroups: [['feet']]
});

ItemDefs.sharkskinSuit = new ItemDef({
  name: 'sharkskinSuit',
  displayName: 'Sharkskin Suit',
  icon: '👔🦈',
  evadePercent: 15,
  maxGP: 2500,
  slot: 'chest',
  stackable: false,
  type: 'armor',
  equipGroups: [['chest']]
});

ItemDefs.shield = new ItemDef({
  name: 'shield',
  displayName: 'Shield',
  icon: '🛡️',
  evadePercent: 15,
  maxGP: 150,
  slot: 'rightHand',
  stackable: false,
  type: 'armor',
  equipGroups: [['rightHand']]
});

ItemDefs.bagOfHolding = new ItemDef({
  name: 'bagOfHolding',
  displayName: 'Bag of Holding',
  icon: '💼🌟',
  bagSlots: 10,
  maxGP: 600,
  minLevel: 20,
  stackable: false,
  type: 'bag'
});

ItemDefs.canvasTote = new ItemDef({
  name: 'canvasTote',
  displayName: 'Canvas Tote',
  icon: '🛍️',
  bagSlots: 3,
  maxGP: 8,
  stackable: false,
  type: 'bag'
});

ItemDefs.embroideredClutch = new ItemDef({
  name: 'embroideredClutch',
  displayName: 'Embroidered Clutch',
  icon: '👝',
  bagSlots: 5,
  maxGP: 55,
  minLevel: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.enchantedValise = new ItemDef({
  name: 'enchantedValise',
  displayName: 'Enchanted Valise',
  icon: '🧳✨',
  bagSlots: 10,
  maxGP: 500,
  minLevel: 20,
  stackable: false,
  type: 'bag'
});

ItemDefs.executiveBriefcase = new ItemDef({
  name: 'executiveBriefcase',
  displayName: 'Executive Briefcase',
  icon: '💼',
  bagSlots: 5,
  maxGP: 60,
  minLevel: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.fireproofRucksack = new ItemDef({
  name: 'fireproofRucksack',
  displayName: 'Fireproof Rucksack',
  icon: '🎒🔥',
  bagSlots: 5,
  maxGP: 75,
  minLevel: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.interdimensionalCarryall = new ItemDef({
  name: 'interdimensionalCarryall',
  displayName: 'Interdimensional Carryall',
  icon: '🎒💫',
  bagSlots: 10,
  maxGP: 550,
  minLevel: 20,
  stackable: false,
  type: 'bag'
});

ItemDefs.ironToolbox = new ItemDef({
  name: 'ironToolbox',
  displayName: 'Iron Toolbox',
  icon: '🧰',
  bagSlots: 5,
  maxGP: 45,
  minLevel: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.leatherPurse = new ItemDef({
  name: 'leatherPurse',
  displayName: 'Leather Purse',
  icon: '👜',
  bagSlots: 3,
  maxGP: 12,
  stackable: false,
  type: 'bag'
});

ItemDefs.leatherSuitcase = new ItemDef({
  name: 'leatherSuitcase',
  displayName: 'Leather Suitcase',
  icon: '🧳',
  bagSlots: 5,
  maxGP: 50,
  minLevel: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.smallClothBag = new ItemDef({
  name: 'smallClothBag',
  displayName: 'Small Cloth Bag',
  icon: '🎒',
  bagSlots: 3,
  maxGP: 10,
  stackable: false,
  type: 'bag'
});

ItemDefs.theLuggage = new ItemDef({
  name: 'theLuggage',
  displayName: 'The Luggage',
  icon: '🎒🌈',
  bagSlots: 100,
  maxGP: 10000,
  minLevel: 1,
  stackable: false,
  type: 'bag'
});

ItemDefs.tupperwareOfHolding = new ItemDef({
  name: 'tupperwareOfHolding',
  displayName: 'Tupperware of Holding',
  icon: '🫙',
  bagSlots: 3,
  maxGP: 15,
  stackable: false,
  type: 'bag'
});

ItemDefs.woodenCrate = new ItemDef({
  name: 'woodenCrate',
  displayName: 'Wooden Crate',
  icon: '📦',
  bagSlots: 3,
  maxGP: 6,
  stackable: false,
  type: 'bag'
});

ItemDefs.box = new ItemDef({
  name: 'box',
  displayName: 'Box',
  icon: '🟫',
  bagSlots: 2,
  impassable: true,
  maxGP: 8,
  stackable: false,
  type: 'container'
});

ItemDefs.barrel = new ItemDef({
  name: 'barrel',
  displayName: 'Barrel',
  icon: '🛢️',
  bagSlots: 2,
  impassable: true,
  maxGP: 10,
  stackable: false,
  type: 'container'
});

ItemDefs.endTable = new ItemDef({
  name: 'endTable',
  displayName: 'End Table',
  icon: '🟫',
  bagSlots: 2,
  impassable: true,
  maxGP: 12,
  stackable: false,
  type: 'container'
});

ItemDefs.strongbox = new ItemDef({
  name: 'strongbox',
  displayName: 'Strongbox',
  icon: '📫',
  bagSlots: 3,
  lockable: true,
  maxGP: 60,
  stackable: false,
  type: 'container'
});

ItemDefs.smallCrate = new ItemDef({
  name: 'smallCrate',
  displayName: 'Small Crate',
  icon: '📦',
  bagSlots: 3,
  maxGP: 15,
  stackable: false,
  type: 'container'
});

ItemDefs.smallChest = new ItemDef({
  name: 'smallChest',
  displayName: 'Small Chest',
  icon: '🗃️',
  bagSlots: 4,
  lockable: true,
  maxGP: 80,
  stackable: false,
  type: 'container'
});

ItemDefs.table = new ItemDef({
  name: 'table',
  displayName: 'Table',
  icon: '🟫',
  bagSlots: 4,
  impassable: true,
  maxGP: 25,
  stackable: false,
  type: 'container'
});

ItemDefs.largeChest = new ItemDef({
  name: 'largeChest',
  displayName: 'Large Chest',
  icon: '🗃️',
  bagSlots: 7,
  impassable: true,
  lockable: true,
  maxGP: 150,
  stackable: false,
  type: 'container'
});

ItemDefs.largeCrate = new ItemDef({
  name: 'largeCrate',
  displayName: 'Large Crate',
  icon: '📦',
  bagSlots: 7,
  maxGP: 40,
  stackable: false,
  type: 'container'
});

ItemDefs.ironChest = new ItemDef({
  name: 'ironChest',
  displayName: 'Iron Chest',
  icon: '🗃️',
  bagSlots: 9,
  impassable: true,
  lockable: true,
  maxGP: 300,
  stackable: false,
  type: 'container'
});

ItemDefs.longTable = new ItemDef({
  name: 'longTable',
  displayName: 'Long Table',
  icon: '🟫',
  bagSlots: 9,
  impassable: true,
  maxGP: 60,
  stackable: false,
  type: 'container'
});

ItemDefs.safe = new ItemDef({
  name: 'safe',
  displayName: 'Safe',
  icon: '🗄️',
  bagSlots: 12,
  impassable: true,
  lockable: true,
  maxGP: 500,
  stackable: false,
  type: 'container'
});

ItemDefs.boxOfHolding = new ItemDef({
  name: 'boxOfHolding',
  displayName: 'Box of Holding',
  icon: '📦',
  bagSlots: 15,
  maxGP: 800,
  stackable: false,
  type: 'container'
});

ItemDefs.chestOfHolding = new ItemDef({
  name: 'chestOfHolding',
  displayName: 'Chest of Holding',
  icon: '🗃️',
  bagSlots: 20,
  lockable: true,
  maxGP: 1500,
  stackable: false,
  type: 'container'
});

ItemDefs.safeOfHolding = new ItemDef({
  name: 'safeOfHolding',
  displayName: 'Safe of Holding',
  icon: '🗄️',
  bagSlots: 30,
  impassable: true,
  lockable: true,
  maxGP: 3000,
  stackable: false,
  type: 'container'
});

ItemDefs.carrot = new ItemDef({
  name: 'carrot',
  displayName: 'Carrot',
  icon: '🥕',
  foodValue: 8,
  maxGP: 2,
  maxHeal: 3,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.cheese = new ItemDef({
  name: 'cheese',
  displayName: 'Cheese',
  icon: '🧀',
  foodValue: 5,
  maxGP: 3,
  maxHeal: 5,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.curry = new ItemDef({
  name: 'curry',
  displayName: 'Curry',
  icon: '🍛',
  foodValue: 40,
  maxGP: 20,
  maxHeal: 15,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.duckLeg = new ItemDef({
  name: 'duckLeg',
  displayName: 'Duck Leg',
  icon: '🍗',
  foodValue: 15,
  maxGP: 5,
  maxHeal: 8,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.holyNoodle = new ItemDef({
  name: 'holyNoodle',
  displayName: 'Holy Noodle',
  icon: '🍝',
  foodValue: 10,
  maxGP: 5,
  maxHeal: 5,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.meat = new ItemDef({
  name: 'meat',
  displayName: 'Meat',
  icon: '🍖',
  foodValue: 25,
  maxGP: 10,
  maxHeal: 12,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.pizza = new ItemDef({
  name: 'pizza',
  displayName: 'Pizza',
  icon: '🍕',
  foodValue: 30,
  maxGP: 15,
  maxHeal: 10,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.ramenOfTheDeep = new ItemDef({
  name: 'ramenOfTheDeep',
  displayName: 'Ramen of the Deep',
  icon: '🌊',
  foodValue: 20,
  maxGP: 10,
  maxHeal: 15,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.milk = new ItemDef({
  name: 'milk',
  displayName: 'Milk',
  icon: '🥛',
  foodValue: 5,
  maxGP: 3,
  maxHeal: 2,
  maxStack: 99,
  type: 'food'
});

ItemDefs.peanuts = new ItemDef({
  name: 'peanuts',
  displayName: 'Peanuts',
  icon: '🥜',
  foodValue: 4,
  maxGP: 1,
  maxHeal: 1,
  maxStack: 99,
  type: 'food'
});

ItemDefs.oyster = new ItemDef({
  name: 'oyster',
  displayName: 'Oyster',
  icon: '🦪',
  foodValue: 6,
  maxGP: 2,
  maxHeal: 4,
  maxStack: 99,
  type: 'food'
});

ItemDefs.slurpee = new ItemDef({
  name: 'slurpee',
  displayName: 'Slurpee',
  icon: '🥤',
  foodValue: 10,
  maxGP: 8,
  maxHeal: 5,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.soupOfTranscendence = new ItemDef({
  name: 'soupOfTranscendence',
  displayName: 'Soup of Transcendence',
  icon: '🍜',
  foodValue: 30,
  maxGP: 15,
  maxHeal: 25,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.wateredDownBeer = new ItemDef({
  name: 'wateredDownBeer',
  displayName: 'Watered Down Beer',
  icon: '🍺',
  foodValue: 3,
  maxGP: 5,
  maxHeal: 0,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.whiskey = new ItemDef({
  name: 'whiskey',
  displayName: 'Whiskey',
  icon: '🥃',
  foodValue: 5,
  maxGP: 15,
  maxHeal: -5,
  maxStack: 99,
  stackable: true,
  type: 'food'
});

ItemDefs.key = new ItemDef({
  name: 'key',
  displayName: 'Key',
  icon: '🗝️',
  maxGP: 25,
  stackable: true,
  type: 'key'
});

ItemDefs.candle = new ItemDef({
  name: 'candle',
  displayName: 'Candle',
  icon: '🕯️',
  burnTime: 25,
  equipChoice: ['leftHand', 'rightHand'],
  leaves: 'blobOfWax',
  lightRadius: 3,
  maxGP: 15,
  stackable: false,
  type: 'light',
  equipGroups: [['leftHand'], ['rightHand']]
});

ItemDefs.torch = new ItemDef({
  name: 'torch',
  displayName: 'Torch',
  icon: '🔥',
  burnTime: 30,
  equipChoice: ['leftHand', 'rightHand'],
  leaves: 'spentTorch',
  lightRadius: 4,
  maxGP: 25,
  stackable: false,
  type: 'light',
  equipGroups: [['leftHand'], ['rightHand']]
});

ItemDefs.lantern = new ItemDef({
  name: 'lantern',
  displayName: 'Lantern',
  icon: '🏮',
  burnTime: 40,
  equipChoice: ['leftHand', 'rightHand'],
  leaves: 'emptyLantern',
  lightRadius: 5,
  maxGP: 50,
  stackable: false,
  type: 'light',
  equipGroups: [['leftHand'], ['rightHand']]
});

ItemDefs.bomb = new ItemDef({
  name: 'bomb',
  displayName: 'Bomb',
  icon: '💣',
  baseDamage: 50,
  blastRadius: 5,
  damagePerTile: 10,
  fuseTime: 10,
  maxGP: 50,
  maxStack: 5,
  stackable: true,
  type: 'explosive'
});

ItemDefs.brassBottle = new ItemDef({
  name: 'brassBottle',
  displayName: 'Brass Bottle',
  icon: '🏺',
  maxGP: 100,
  stackable: false,
  type: 'misc'
});

ItemDefs.halfCoconut = new ItemDef({
  name: 'halfCoconut',
  displayName: 'Half-Coconut',
  icon: '🥥',
  maxGP: 5,
  stackable: false,
  type: 'misc'
});

ItemDefs.holyHandGrenade = new ItemDef({
  name: 'holyHandGrenade',
  displayName: 'Holy Hand Grenade',
  icon: '💣🌟',
  maxGP: 1000,
  stackable: false,
  type: 'misc'
});

ItemDefs.lockpickingTools = new ItemDef({
  name: 'lockpickingTools',
  displayName: 'Lockpicking Tools',
  icon: '🔐',
  maxGP: 50,
  stackable: false,
  type: 'misc'
});

ItemDefs.magicTeapot = new ItemDef({
  name: 'magicTeapot',
  displayName: 'Magic Teapot',
  icon: '🫖',
  maxGP: 7500,
  stackable: false,
  type: 'misc'
});

ItemDefs.resurrectionCrystal = new ItemDef({
  name: 'resurrectionCrystal',
  displayName: 'Resurrection Crystal',
  icon: '💎💠',
  maxGP: 5000,
  stackable: false,
  type: 'misc'
});

ItemDefs.elixirOfLife = new ItemDef({
  name: 'elixirOfLife',
  displayName: 'Elixir of Life',
  icon: '🧪💎',
  maxGP: 3000,
  maxHeal: 9999,
  maxStack: 99,
  stackable: true,
  type: 'potion'
});

ItemDefs.healthPotion = new ItemDef({
  name: 'healthPotion',
  displayName: 'Health Potion',
  icon: '🧪',
  maxGP: 50,
  maxHeal: 25,
  maxStack: 99,
  stackable: true,
  type: 'potion'
});

ItemDefs.potionOfNewt = new ItemDef({
  name: 'potionOfNewt',
  displayName: 'Potion of Newt',
  icon: '🧪🦎',
  maxGP: 50,
  maxHeal: 0,
  maxStack: 99,
  stackable: true,
  type: 'potion'
});

ItemDefs.blackCauldron = new ItemDef({
  name: 'blackCauldron',
  displayName: 'Black Cauldron',
  icon: '🍲',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.goldLocket = new ItemDef({
  name: 'goldLocket',
  displayName: 'Gold Locket',
  icon: '🏅',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.harp = new ItemDef({
  name: 'harp',
  displayName: 'Harp',
  icon: '🪕',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.heirloomShield = new ItemDef({
  name: 'heirloomShield',
  displayName: 'Heirloom Shield',
  icon: '🛡️🏛️',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.orichalcumBead = new ItemDef({
  name: 'orichalcumBead',
  displayName: 'Orichalcum Bead',
  icon: '📿',
  maxGP: 0,
  stackable: true,
  type: 'quest'
});

ItemDefs.pulley = new ItemDef({
  name: 'pulley',
  displayName: 'Pulley',
  icon: '⚙️',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.redHerring = new ItemDef({
  name: 'redHerring',
  displayName: 'Red Herring',
  icon: '🐟',
  maxGP: 10,
  stackable: false,
  type: 'quest'
});

ItemDefs.rubberChicken = new ItemDef({
  name: 'rubberChicken',
  displayName: 'Rubber Chicken',
  icon: '🐔',
  maxGP: 0,
  stackable: false,
  type: 'quest'
});

ItemDefs.sharkTooth = new ItemDef({
  name: 'sharkTooth',
  displayName: 'Shark Tooth',
  icon: '🦷',
  maxGP: 50,
  stackable: true,
  type: 'quest'
});

ItemDefs.rubberDuck = new ItemDef({
  name: 'rubberDuck',
  displayName: 'Rubber Duck',
  icon: '🦆',
  maxGP: 0,
  maxStack: 1,
  type: 'quest'
});

ItemDefs.severedLeg = new ItemDef({
  name: 'severedLeg',
  displayName: 'Severed Leg',
  icon: '🦵',
  maxGP: 0,
  maxStack: 1,
  type: 'quest'
});

ItemDefs.wetRatTail = new ItemDef({
  name: 'wetRatTail',
  displayName: 'Wet Rat Tail',
  icon: '🐀💦',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.constitutionalConvention = new ItemDef({
  name: 'constitutionalConvention',
  displayName: 'Constitutional Convention',
  icon: '📜📜',
  maxGP: 0,
  maxStack: 99,
  stackable: true,
  type: 'scroll'
});

ItemDefs.identifyScroll = new ItemDef({
  name: 'identifyScroll',
  displayName: 'Identify Scroll',
  icon: '📃',
  maxGP: 15,
  maxStack: 99,
  stackable: true,
  type: 'scroll'
});

ItemDefs.scrollOfBeachPortal = new ItemDef({
  name: 'scrollOfBeachPortal',
  displayName: 'Scroll of Beach Portal',
  icon: '📜🏖️',
  maxGP: 200,
  maxStack: 99,
  minLevel: 7,
  spell: 'beach_portal',
  stackable: true,
  type: 'scroll'
});

ItemDefs.scrollOfTunnel = new ItemDef({
  name: 'scrollOfTunnel',
  displayName: 'Scroll of Tunnel',
  icon: '⛏️',
  maxGP: 75,
  maxStack: 99,
  spell: 'tunnel',
  stackable: true,
  type: 'scroll'
});

ItemDefs.townPortalScroll = new ItemDef({
  name: 'townPortalScroll',
  displayName: 'Town Portal Scroll',
  icon: '🌀',
  maxGP: 100,
  maxStack: 99,
  spell: 'portal',
  stackable: true,
  type: 'scroll'
});

ItemDefs.tomeOfChainLightning = new ItemDef({
  name: 'tomeOfChainLightning',
  displayName: 'Tome of Chain Lightning',
  icon: '📚🔥',
  maxGP: 6000,
  spell: 'lightning',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfFireball = new ItemDef({
  name: 'tomeOfFireball',
  displayName: 'Tome of Fireball',
  icon: '🔥📘',
  maxGP: 800,
  spell: 'fireball',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfHaste = new ItemDef({
  name: 'tomeOfHaste',
  displayName: 'Tome of Haste',
  icon: '👟📘',
  maxGP: 1500,
  spell: 'haste',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfHeal = new ItemDef({
  name: 'tomeOfHeal',
  displayName: 'Tome of Heal',
  icon: '💖📘',
  maxGP: 1200,
  spell: 'heal',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfIceBolt = new ItemDef({
  name: 'tomeOfIceBolt',
  displayName: 'Tome of Ice Bolt',
  icon: '❄️📘',
  maxGP: 600,
  spell: 'icebolt',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfLightning = new ItemDef({
  name: 'tomeOfLightning',
  displayName: 'Tome of Lightning',
  icon: '⚡📘',
  maxGP: 800,
  spell: 'lightning',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfShield = new ItemDef({
  name: 'tomeOfShield',
  displayName: 'Tome of Shield',
  icon: '🛡️📘',
  maxGP: 1000,
  spell: 'shield',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfStrength = new ItemDef({
  name: 'tomeOfStrength',
  displayName: 'Tome of Strength',
  icon: '💪📘',
  maxGP: 1000,
  spell: 'strength',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfIlluminate = new ItemDef({
  name: 'tomeOfIlluminate',
  displayName: 'Tome of Illuminate',
  icon: '🌀📘',
  maxGP: 400,
  spell: 'illuminate',
  stackable: false,
  type: 'spell'
});

ItemDefs.tomeOfTownPortal = new ItemDef({
  name: 'tomeOfTownPortal',
  displayName: 'Tome of Town Portal',
  icon: '📖🌀',
  desc: 'A powerful tome containing the Town Portal spell. Not available in any store.',
  maxGP: 0,
  shopForbidden: true,
  spell: 'portal',
  stackable: false,
  type: 'spell',
  unique: true
});

ItemDefs.oneCheetoStale = new ItemDef({
  name: 'oneCheetoStale',
  displayName: '1 Cheeto (stale)',
  icon: '🟠',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.aMarble = new ItemDef({
  name: 'aMarble',
  displayName: 'A Marble',
  icon: '🧿',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.anchorOfEnlightenment = new ItemDef({
  name: 'anchorOfEnlightenment',
  displayName: 'Anchor of Enlightenment',
  icon: '⚓',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.apusClubCard = new ItemDef({
  name: 'apusClubCard',
  displayName: 'Apu\'s Club Card',
  icon: '💳',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.bellyButtonLint = new ItemDef({
  name: 'bellyButtonLint',
  displayName: 'Belly Button Lint',
  icon: '🔘',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.bentNeedle = new ItemDef({
  name: 'bentNeedle',
  displayName: 'Bent Needle',
  icon: '🪡',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.bitOfAsbestos = new ItemDef({
  name: 'bitOfAsbestos',
  displayName: 'Bit of Asbestos',
  icon: '🧲',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.blessedCoconutCanoe = new ItemDef({
  name: 'blessedCoconutCanoe',
  displayName: 'Blessed Coconut Canoe',
  icon: '⛵',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.blessedParrotFeather = new ItemDef({
  name: 'blessedParrotFeather',
  displayName: 'Blessed Parrot Feather',
  icon: '🦜',
  maxGP: 1,
  stackable: false,
  type: 'useless'
});

ItemDefs.bloodDrop = new ItemDef({
  name: 'bloodDrop',
  displayName: 'Blood Drop',
  icon: '🩸',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.bone = new ItemDef({
  name: 'bone',
  displayName: 'Bone',
  icon: '🦴',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.brick = new ItemDef({
  name: 'brick',
  displayName: 'Brick',
  icon: '🧱',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.burntOutCandle = new ItemDef({
  name: 'burntOutCandle',
  displayName: 'Burnt-Out Candle',
  icon: '🕯️💨',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.blobOfWax = new ItemDef({
  name: 'blobOfWax',
  displayName: 'Blob of Wax',
  icon: '🕯️🫗',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.spentTorch = new ItemDef({
  name: 'spentTorch',
  displayName: 'Spent Torch',
  icon: '🪵🔥',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.emptyLantern = new ItemDef({
  name: 'emptyLantern',
  displayName: 'Empty Lantern',
  icon: '🏮⚫',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.certifiedPastafarian = new ItemDef({
  name: 'certifiedPastafarian',
  displayName: 'Certified Pastafarian',
  icon: '📜',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.cockroachLegStale = new ItemDef({
  name: 'cockroachLegStale',
  displayName: 'Cockroach Leg (stale)',
  icon: '🦗',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.dandruffFlake = new ItemDef({
  name: 'dandruffFlake',
  displayName: 'Dandruff Flake',
  icon: '🫧',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.feather = new ItemDef({
  name: 'feather',
  displayName: 'Feather',
  icon: '🪶',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.goldenEgg = new ItemDef({
  name: 'goldenEgg',
  displayName: 'Golden Egg',
  icon: '🥚',
  maxGP: 50,
  stackable: false,
  type: 'useless'
});

ItemDefs.hensTeeth = new ItemDef({
  name: 'hensTeeth',
  displayName: 'Hen\'s Teeth',
  icon: '🦷💀',
  maxGP: 2,
  stackable: true,
  type: 'useless'
});

ItemDefs.oldNews = new ItemDef({
  name: 'oldNews',
  displayName: 'Old News',
  icon: '📰',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.paperclip = new ItemDef({
  name: 'paperclip',
  displayName: 'Paperclip',
  icon: '📎',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.thread = new ItemDef({
  name: 'thread',
  displayName: 'Thread',
  icon: '🧵',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.pirateFlagOfTheFsm = new ItemDef({
  name: 'pirateFlagOfTheFsm',
  displayName: 'Pirate Flag of the FSM',
  icon: '🏴‍☠️',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.plansForWorldDomination = new ItemDef({
  name: 'plansForWorldDomination',
  displayName: 'Plans for World Domination',
  icon: '📋',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.pocketSand = new ItemDef({
  name: 'pocketSand',
  displayName: 'Pocket Sand',
  icon: '🫘',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.poop = new ItemDef({
  name: 'poop',
  displayName: 'Poop',
  icon: '💩',
  maxGP: 0,
  maxPoison: 4,
  stackable: true,
  type: 'useless'
});

ItemDefs.quill = new ItemDef({
  name: 'quill',
  displayName: 'Quill',
  icon: '🔱',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.singleGlove = new ItemDef({
  name: 'singleGlove',
  displayName: 'Single Glove',
  icon: '🧤',
  maxGP: 3,
  stackable: false,
  type: 'useless'
});

ItemDefs.smallRock = new ItemDef({
  name: 'smallRock',
  displayName: 'Small Rock',
  icon: '🪨',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.soap = new ItemDef({
  name: 'soap',
  displayName: 'Soap',
  icon: '🧼',
  maxGP: 5,
  stackable: true,
  type: 'useless'
});

ItemDefs.spellResidue = new ItemDef({
  name: 'spellResidue',
  displayName: 'Spell Residue',
  icon: '🌫️',
  maxGP: 0,
  maxStack: 10,
  stackable: true,
  type: 'useless'
});

ItemDefs.tuftOfHair = new ItemDef({
  name: 'tuftOfHair',
  displayName: 'Tuft of Hair',
  icon: '💇',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.stick = new ItemDef({
  name: 'stick',
  displayName: 'Stick',
  icon: '🪵',
  maxGP: 1,
  stackable: true,
  type: 'useless'
});

ItemDefs.shell = new ItemDef({
  name: 'shell',
  displayName: 'Shell',
  icon: '🐚',
  maxGP: 2,
  stackable: true,
  type: 'useless'
});

ItemDefs.glasses = new ItemDef({
  name: 'glasses',
  displayName: 'Glasses',
  icon: '👓',
  maxGP: 10,
  stackable: false,
  type: 'useless'
});

ItemDefs.dirt = new ItemDef({
  name: 'dirt',
  displayName: 'Dirt',
  icon: '🌿',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.rawMeat = new ItemDef({
  name: 'rawMeat',
  displayName: 'Raw Meat',
  icon: '🥩',
  foodValue: 15,
  maxGP: 3,
  maxHeal: 8,
  maxStack: 10,
  stackable: true,
  type: 'food'
});

ItemDefs.communistManifesto = new ItemDef({
  name: 'communistManifesto',
  displayName: 'Communist Manifesto',
  icon: '🧾',
  maxGP: 0,
  stackable: false,
  type: 'useless'
});

ItemDefs.bikini = new ItemDef({
  name: 'bikini',
  displayName: 'Bikini',
  icon: '👙',
  evadePercent: 5,
  maxGP: 15,
  slot: 'legs',
  stackable: false,
  type: 'armor',
  equipGroups: [['legs']]
});

ItemDefs.yarn = new ItemDef({
  name: 'yarn',
  displayName: 'Yarn',
  icon: '🧶',
  maxGP: 2,
  stackable: true,
  type: 'useless'
});

ItemDefs.earthworm = new ItemDef({
  name: 'earthworm',
  displayName: 'Earthworm',
  icon: '🪱',
  maxGP: 0,
  stackable: true,
  type: 'useless'
});

ItemDefs.prophylactic = new ItemDef({
  name: 'prophylactic',
  displayName: 'Prophylactic',
  icon: '🧴',
  maxGP: 0,
  maxStack: 1,
  type: 'useless'
});

ItemDefs.goldBag = new ItemDef({
  name: 'goldBag',
  displayName: 'Gold Bag',
  icon: '💰',
  maxGP: 50,
  stackable: false,
  type: 'wealth'
});

ItemDefs.gold = new ItemDef({
  name: 'gold',
  displayName: 'Gold',
  icon: '🪙',
  maxGP: 0,
  maxStack: 9999,
  pickupTo: 'gp',
  type: 'wealth'
});

ItemDefs.accordion = new ItemDef({
  name: 'accordion',
  displayName: 'Accordion',
  icon: '🪗',
  baseDmg: 0,
  maxGP: 0,
  special: 'accordion',
  stackable: false,
  type: 'weapon',
  equipGroups: [['leftHand']]
});

ItemDefs.bow = new ItemDef({
  name: 'bow',
  displayName: 'Bow',
  icon: '🏹',
  ammoName: 'arrows',
  baseDmg: 1,
  equipTo: ['leftHand', 'rightHand'],
  maxGP: 25,
  range: 9,
  ranged: true,
  rangedDamage: 8,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldBows',
  equipGroups: [['leftHand', 'rightHand']]
});

ItemDefs.excalibur = new ItemDef({
  name: 'excalibur',
  displayName: 'Excalibur',
  icon: '🗡️✨',
  baseDmg: 12,
  maxGP: 12000,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldSwords',
  equipGroups: [['leftHand']]
});

ItemDefs.properStaff = new ItemDef({
  name: 'properStaff',
  displayName: 'Proper Staff',
  icon: '🦯✨',
  baseDmg: 5,
  magicScaling: 'int',
  manaCost: 5,
  maxGP: 25000,
  range: 9,
  ranged: true,
  rangedDamage: 20,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldStaffs',
  equipGroups: [['leftHand']]
});

ItemDefs.staff = new ItemDef({
  name: 'staff',
  displayName: 'Staff',
  icon: '🦯',
  baseDmg: 4,
  maxGP: 5,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldStaffs',
  equipGroups: [['leftHand'], ['rightHand']]
});

ItemDefs.sword = new ItemDef({
  name: 'sword',
  displayName: 'Sword',
  icon: '🗡️',
  baseDmg: 8,
  maxGP: 100,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldSwords',
  equipGroups: [['leftHand']]
});

ItemDefs.wizardsWand = new ItemDef({
  name: 'wizardsWand',
  displayName: 'Wizard\'s Wand',
  icon: '🪄',
  baseDmg: 1,
  magicScaling: 'int',
  manaCost: 3,
  maxGP: 25000,
  range: 8,
  ranged: true,
  rangedDamage: 15,
  stackable: false,
  type: 'weapon',
  wieldTalent: 'wieldStaffs',
  equipGroups: [['leftHand']]
});

// ─── End auto-generated ───────────────────────────────────
// 157 ItemDefs generated from LEGACY_ITEM_DATA

window.ItemDefs = ItemDefs;

// ─── Direct (non-legacy) ItemDefs ──────────────────────────
// Items registered here bypass LEGACY_ITEM_DATA entirely.
// They can share icons with legacy items — the registry's
// camelCase key and _byIcon first-wins rule keep things clean.
// ── New tomes (from raw/spells.txt) ────────────────────────
ItemDefs.tomeOfBurningHands = new ItemDef({
  name: 'tomeOfBurningHands',
  displayName: 'Tome of Burning Hands',
  icon: '\uD83D\uDCD6\uD83D\uDD25',
  type: 'spell',
  spell: 'burningHands',
  maxGP: 600,
});
ItemDefs.tomeOfCureCondition = new ItemDef({
  name: 'tomeOfCureCondition',
  displayName: 'Tome of Cure Condition',
  icon: '\uD83D\uDCD6\uD83D\uDC8A',
  type: 'spell',
  spell: 'cureCondition',
  maxGP: 800,
});
ItemDefs.tomeOfHealWounds = new ItemDef({
  name: 'tomeOfHealWounds',
  displayName: 'Tome of Heal Wounds',
  icon: '\uD83D\uDCD6\uD83D\uDC9A',
  type: 'spell',
  spell: 'healWounds',
  maxGP: 1200,
});
ItemDefs.tomeOfHinder = new ItemDef({
  name: 'tomeOfHinder',
  displayName: 'Tome of Hinder',
  icon: '\uD83D\uDCD6\uD83D\uDCA8',
  type: 'spell',
  spell: 'hinder',
  maxGP: 700,
});
ItemDefs.tomeOfNecroticShroud = new ItemDef({
  name: 'tomeOfNecroticShroud',
  displayName: 'Tome of Necrotic Shroud',
  icon: '\uD83D\uDCD6\uD83D\uDC80',
  type: 'spell',
  spell: 'necroticShroud',
  maxGP: 1500,
});
ItemDefs.tomeOfNourish = new ItemDef({
  name: 'tomeOfNourish',
  displayName: 'Tome of Nourish',
  icon: '\uD83D\uDCD6\uD83C\uDF4E',
  type: 'spell',
  spell: 'nourish',
  maxGP: 500,
});

// ── New items from raw/spells.txt ─────────────────────────
ItemDefs.burningGloves = new ItemDef({
  name: 'burningGloves',
  displayName: 'Burning Gloves',
  icon: '\uD83E\uDDE4\uD83D\uDD25',
  type: 'equip',
  equipChoice: ['leftHand', 'rightHand'],
  equipGroups: [['leftHand'], ['rightHand']],
  maxGP: 250,
});
ItemDefs.antitoxin = new ItemDef({
  name: 'antitoxin',
  displayName: 'Antitoxin',
  icon: '\uD83D\uDC8A\uD83E\uDDA0',
  type: 'potion',
  maxHeal: 0,
  maxGP: 20,
  stackable: true,
  maxStack: 99,
});
ItemDefs.antibiotic = new ItemDef({
  name: 'antibiotic',
  displayName: 'Antibiotic',
  icon: '\uD83D\uDC8A\uD83E\uDDEC',
  type: 'potion',
  maxHeal: 0,
  maxGP: 30,
  stackable: true,
  maxStack: 99,
});
ItemDefs.smokeBomb = new ItemDef({
  name: 'smokeBomb',
  displayName: 'Smoke Bomb',
  icon: '\uD83D\uDCA8',
  type: 'scroll',
  spell: 'hinder',
  maxGP: 35,
  stackable: true,
  maxStack: 20,
});
ItemDefs.necroticSkin = new ItemDef({
  name: 'necroticSkin',
  displayName: 'Necrotic Skin',
  icon: '\uD83D\uDC7B',
  type: 'equip',
  slot: 'chest',
  equipGroups: [['chest']],
  maxGP: 2000,
});

ItemDefs.dagger = new ItemDef({
  name: 'dagger',
  displayName: 'Dagger',
  icon: '🔪',
  type: 'weapon',
  baseDmg: 5,
  maxGP: 50,
  wieldTalent: 'wieldDaggers',
});

ItemDefs.scumbleMainlyApples = new ItemDef({
  name: 'scumbleMainlyApples',
  displayName: 'Scumble (mainly apples)',
  icon: '🍺',
  type: 'food',
  maxGP: 2,
  maxHeal: 2,
  foodValue: 6,
  maxStack: 99,
});

ItemDefs.bread = new ItemDef({
  name: 'bread',
  displayName: 'Bread',
  icon: '🍞',
  type: 'food',
  maxGP: 1,
  maxHeal: 3,
  foodValue: 5,
  maxStack: 99,
});

ItemDefs.dwarfBread = new ItemDef({
  name: 'dwarfBread',
  displayName: 'Dwarf Bread (also a weapon)',
  icon: '🍖',
  type: 'food',
  maxGP: 3,
  maxHeal: 6,
  foodValue: 10,
  maxStack: 10,
  baseDmg: 3,
});

ItemDefs.lancreCheese = new ItemDef({
  name: 'lancreCheese',
  displayName: 'Lancre Cheese (legally a weapon)',
  icon: '🧀',
  type: 'food',
  maxGP: 2,
  maxHeal: 4,
  foodValue: 8,
  maxStack: 10,
  baseDmg: 2,
});

ItemDefs.innSewerAntsPolicy = new ItemDef({
  name: 'innSewerAntsPolicy',
  displayName: 'Inn-Sewer-Ants Policy',
  icon: '📜',
  type: 'scroll',
  maxGP: 25,
  stackable: true,
  maxStack: 99,
});

ItemDefs.perfectlyOrdinarySword = new ItemDef({
  name: 'perfectlyOrdinarySword',
  displayName: 'Perfectly Ordinary Sword',
  icon: '🗡️',
  type: 'weapon',
  maxGP: 60,
  baseDmg: 8,
  wieldTalent: 'wieldSwords',
});

ItemDefs.mysteriousDagger = new ItemDef({
  name: 'mysteriousDagger',
  displayName: 'Mysterious Dagger',
  icon: '🗡️',
  type: 'weapon',
  maxGP: 25,
  baseDmg: 7,
  wieldTalent: 'wieldDaggers',
});

ItemDefs.leatherGloves = new ItemDef({
  name: 'leatherGloves',
  displayName: 'Leather Gloves',
  icon: '🧤',
  type: 'equip',
  maxGP: 15,
  slot: 'gloves',
});

ItemDefs.tarnishedRing = new ItemDef({
  name: 'tarnishedRing',
  displayName: 'Tarnished Ring',
  icon: '💍',
  type: 'equip',
  maxGP: 50,
  slot: 'finger',
});

// ─── Unified shop item catalogs ──────────────────────────────
// Single source of truth for all NPC shop inventories. Each entry is
// { id: camelCaseItemDefsId, cost: buyPrice/stealValue, qty?: quantity }.
// Icon, displayName, and other properties are resolved from ItemDefs[id]
// at render time.
window.SHOP_ITEM_CATALOGS = {
  'apu': [
    { id: 'identifyScroll', cost: 30 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'healthPotion', cost: 40 },
    { id: 'antitoxin', cost: 20 },
    { id: 'antibiotic', cost: 30 },
    { id: 'smokeBomb', cost: 35 },
    { id: 'candle', cost: 15 },
    { id: 'pizza', cost: 10 },
    { id: 'curry', cost: 5 },
    { id: 'slurpee', cost: 5 },
    { id: 'milk', cost: 3 },
    { id: 'oyster', cost: 2 },
    { id: 'peanuts', cost: 1 },
    { id: 'goldBag', cost: 50 },
    { id: 'smallClothBag', cost: 10 },
    { id: 'leatherPurse', cost: 12 },
    { id: 'canvasTote', cost: 8 },
  ],
  'leftys': [
    { id: 'curry', cost: 5 },
    { id: 'slurpee', cost: 5 },
    { id: 'whiskey', cost: 15 },
    { id: 'wateredDownBeer', cost: 5 },
  ],
  'wizard': [
    { id: 'identifyScroll', cost: 25 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'tomeOfFireball', cost: 800 },
    { id: 'tomeOfIlluminate', cost: 400 },
    { id: 'tomeOfHealWounds', cost: 1200 },
    { id: 'tomeOfBurningHands', cost: 600 },
    { id: 'tomeOfCureCondition', cost: 800 },
    { id: 'tomeOfHinder', cost: 700 },
    { id: 'tomeOfNecroticShroud', cost: 1500 },
    { id: 'tomeOfNourish', cost: 500 },
    { id: 'wizardsWand', cost: 25000 },
    { id: 'properStaff', cost: 25000 },
  ],
  'bookstore': [
    { id: 'identifyScroll', cost: 25 },
    { id: 'townPortalScroll', cost: 5 },
    { id: 'tomeOfFireball', cost: 800 },
    { id: 'tomeOfIlluminate', cost: 400 },
    { id: 'tomeOfHealWounds', cost: 1200 },
    { id: 'tomeOfBurningHands', cost: 600 },
    { id: 'tomeOfCureCondition', cost: 800 },
    { id: 'tomeOfHinder', cost: 700 },
    { id: 'tomeOfNecroticShroud', cost: 1500 },
    { id: 'tomeOfNourish', cost: 500 },
    { id: 'wizardsWand', cost: 25000 },
    { id: 'properStaff', cost: 25000 },
  ],
  'dennis': [
    { id: 'bow', cost: 25 },
    { id: 'arrows', cost: 5, qty: 12 },
    { id: 'rawMeat', cost: 8 },
    { id: 'scarf', cost: 15 },
    { id: 'bread', cost: 3 },
  ],
  'mended_drum_barman': [
    { id: 'scumbleMainlyApples', cost: 4 },
    { id: 'dwarfBread', cost: 6 },
    { id: 'lancreCheese', cost: 5 },
    { id: 'innSewerAntsPolicy', cost: 50 },
    { id: 'perfectlyOrdinarySword', cost: 120 },
  ],
  'blacksmith': [
    { id: 'sword', cost: 100 },
    { id: 'shield', cost: 150 },
    { id: 'staff', cost: 30 },
    { id: 'dagger', cost: 80 },
    { id: 'burningGloves', cost: 250 },
    { id: 'necroticSkin', cost: 2000 },
  ],
};
