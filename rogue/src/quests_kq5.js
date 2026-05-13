  // === King's Quest V Quest Pack ===
  /*
    KING'S QUEST V – RAT RESCUE & TEMPLE OF GREED
    ==============================================
    - Cat and rat on floor 2 (boot throwing mechanic)
    - Rescue rat from cat → savedRat flag
    - Temple of Greed trap (floor 5)
    - Genie boss encounter (floor 10)
  */

  (function() {
    'use strict';

    window._questPacks = window._questPacks || [];
    window._questPacks.push({
      id: 'kings_quest_v',
      name: "King's Quest V",
      quests: [
        // ── THE RAT RESCUE ──
        {
          id: 'q_rat_rescue',
          name: 'Rescue the Rat',
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'A cat is chasing a helpless rat on this floor. Perhaps I can help...',
              trigger: {
                event: 'enter_level',
                filter: { level: 2 },
                requirements: []
              },
              rewards: [],
              rewardExperience: 5
            },
            {
              progress: 20,
              logText: 'I threw the Old Boot at the cat! The rat is saved!',
              trigger: {
                event: 'rat_saved',
                filter: {},
                requirements: []
              },
              rewards: [{ type: 'achievement', id: 'rat_rescued' }],
              rewardExperience: 25,
              finishesQuest: true
            }
          ]
        },

        // ── THE RAT'S GRATITUDE ──
        {
          id: 'q_rat_gratitude',
          name: "A Friend in Need",
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'The rat I saved might remember my kindness...',
              trigger: {
                event: 'enter_level',
                filter: { level: 4 },
                requirements: [{ type: 'flag', flag: 'savedRat' }]
              },
              rewards: [],
              rewardExperience: 5
            },
            {
              progress: 20,
              logText: 'The grateful rat chewed through the ropes binding me!',
              trigger: {
                event: 'rat_helped',
                filter: {},
                requirements: [{ type: 'flag', flag: 'savedRat' }]
              },
              rewards: [{ type: 'achievement', id: 'rat_friend' }],
              rewardExperience: 30,
              finishesQuest: true
            }
          ]
        },

        // ── TEMPLE OF GREED ──
        {
          id: 'q_temple_of_greed',
          name: 'Temple of Greed',
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'An ancient temple tests the greed of those who enter...',
              trigger: {
                event: 'enter_level',
                filter: { level: 5 },
                requirements: []
              },
              rewards: [],
              rewardExperience: 5
            },
            {
              progress: 20,
              logText: 'I survived the Temple of Greed and escaped with the Golden Chalice!',
              trigger: {
                event: 'temple_survived',
                filter: {},
                requirements: []
              },
              rewards: [
                { type: 'achievement', id: 'greed_survived' },
                { type: 'item', item: '🏺', name: 'Golden Chalice' }
              ],
              rewardExperience: 50,
              finishesQuest: true
            }
          ]
        },

        // ── GENIE ENCOUNTER ──
        {
          id: 'q_genie_boss',
          name: 'The Brass Bottle',
          category: 'Quests',
          showInLog: true,
          stages: [
            {
              progress: 10,
              logText: 'A powerful genie awaits in the depths of the dungeon...',
              trigger: {
                event: 'enter_level',
                filter: { level: 10 },
                requirements: []
              },
              rewards: [],
              rewardExperience: 5
            },
            {
              progress: 20,
              logText: 'I defeated the powerful genie!',
              trigger: {
                event: 'kill',
                filter: { type: 'genie' },
                requirements: []
              },
              rewards: [
                { type: 'achievement', id: 'genie_defeated' },
                { type: 'gold', value: 500 }
              ],
              rewardExperience: 100,
              finishesQuest: true
            }
          ]
        },

        // ── EAGLE CRAG ──
      // Floor 3: hungry eagle on a crumbling crag
      // Feed it with meat/fish/duck leg → it saves you from the Roc on Floor 11
      {
        id: 'q_eagle_crag',
        name: 'The Hungry Eagle',
        category: 'Quests',
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: 'I hear a faint, mournful cry echoing from somewhere on this floor...',
            trigger: {
              event: 'enter_level',
              filter: { level: 3 },
              requirements: []
            },
            rewards: [],
            rewardExperience: 5
          },
          {
            progress: 20,
            logText: 'I fed the starving eagle on the crag! It looked at me gratefully before soaring away.',
            trigger: {
              event: 'eagle_fed',
              filter: {},
              requirements: []
            },
            rewards: [{ type: 'achievement', id: 'eagle_eye' }],
            rewardExperience: 50,
            finishesQuest: true
          }
        ]
      },

      // ── ROC RESCUE ──
      // Floor 11: if eagle was fed, it rescues you from the Roc nest
      {
        id: 'q_roc_rescue',
        name: "The Roc's Nest",
        category: 'Quests',
        showInLog: true,
        stages: [
          {
            progress: 10,
            logText: 'A giant Roc snatched me! I am trapped in its nest on the mountain peak.',
            trigger: {
              event: 'enter_level',
              filter: { level: 11 },
              requirements: []
            },
            rewards: [],
            rewardExperience: 5
          },
          {
            progress: 20,
            logText: 'The eagle I saved swooped in and carried me to safety!',
            trigger: {
              event: 'roc_escaped',
              filter: {},
              requirements: [{ type: 'flag', flag: 'fedEagle' }]
            },
            rewards: [{ type: 'achievement', id: 'roc_escape' }],
            rewardExperience: 100,
            finishesQuest: true
          }
        ]
      }
      ],

      achievements: [
        { id: 'rat_rescued', name: 'Friend of the Rats', cat: 'Quests', desc: 'Saved the rat from the cat', icon: '🐀', points: 20 },
        { id: 'rat_friend', name: "A Rat's Gratitude", cat: 'Quests', desc: 'Received help from the grateful rat', icon: '🐀💖', points: 25 },
        { id: 'greed_survived', name: 'Resisted Temptation', cat: 'Quests', desc: 'Survived the Temple of Greed', icon: '🏛️', points: 30 },
        { id: 'genie_defeated', name: 'Genie Slayer', cat: 'Quests', desc: 'Defeated the powerful genie', icon: '🧞', points: 40 },
        { id: 'eagle_eye', name: 'Eagle Eye', cat: 'Quests', desc: 'Fed the starving eagle on the crag', icon: '🦅', points: 20 },
        { id: 'roc_escape', name: 'Roc and Roll', cat: 'Quests', desc: 'Escaped the Roc nest with eagle rescue', icon: '🦅', points: 40 }
      ],

      handlers: {
        spawn_rat_cat: function(data) {
          if(currentLevel === 2) {
            let catPos = findSpawnPosition();
            if(catPos) {
              enemies.push({
                type: 'cat',
                x: catPos.x, y: catPos.y,
                stats: { icon: '🐱', hp: 5, maxHp: 5, damage: 2, isBig: false }
              });
            }
            let ratPos = findSpawnPosition();
            if(ratPos) {
              enemies.push({
                type: 'rat',
                x: ratPos.x, y: ratPos.y,
                stats: { icon: '🐀', hp: 3, maxHp: 3, damage: 0, isBig: false, friendly: true }
              });
            }
            logMsg('<span style="color:var(--warning)">🐱 A cat is chasing a helpless rat!</span>');
          }
        },

        throw_boot_at_cat: function(data) {
          const cat = enemies.find(e => e.type === 'cat');
          const rat = enemies.find(e => e.type === 'rat');
          if(cat && rat) {
            logMsg('<span style="color:var(--success)">🥾 You throw the Old Boot at the cat! It runs away!</span>');
            Sound.playSample ? Sound.playSample('splash') : Sound.splash();
            const catIndex = enemies.indexOf(cat);
            if(catIndex > -1) enemies.splice(catIndex, 1);
            player.savedRat = true;
            rat.stats.icon = '🐀💖';
            if(typeof emitQuestEvent === 'function') emitQuestEvent('rat_saved', {});
            logMsg('<span style="color:var(--primary)">🐀 The rat looks at you gratefully!</span>');
            const bootIndex = inventory.findIndex(i => i && i.icon === '🥾');
            if(bootIndex > -1) { inventory[bootIndex] = null; renderInventory(); }
          }
        },

        rat_helps_in_bandit_camp: function(data) {
          if(currentLevel === 4 && player.savedRat) {
            logMsg('<span style="color:var(--primary)">🐀 The rat you saved appears! It chews through the ropes binding you...</span>');
            player.ratChewedRopes = true;
            if(typeof emitQuestEvent === 'function') emitQuestEvent('rat_helped', {});
            let ratPos = findSpawnPosition();
            if(ratPos) {
              enemies.push({
                type: 'rat',
                x: ratPos.x, y: ratPos.y,
                stats: { icon: '🐀💖', hp: 10, maxHp: 10, damage: 3, friendly: true }
              });
            }
          }
        },

        spawn_temple: function(data) {
          if(currentLevel === 5) {
            logMsg('<span style="color:var(--warning)">🏛️ You enter an ancient temple. A golden idol gleams on an altar...</span>');
            logMsg('<span style="color:#888">💭 (Take the idol? Or is it a trap?)</span>');
            window._templeActive = true;
          }
        },

        temple_collapse: function(data) {
          if(window._templeActive) {
            logMsg('<span style="color:var(--error)">💥 The temple begins to collapse! Run!</span>');
            player.hp -= 20;
            updateUI();
            window._templeActive = false;
            window._templeCollapsed = true;
            if(player.hp > 0) {
              const emptySlot = inventory.findIndex(i => i === null);
              if(emptySlot > -1) {
                inventory[emptySlot] = { icon: '🏺', name: 'Golden Chalice', type: 'quest' };
                renderInventory();
              }
              if(typeof emitQuestEvent === 'function') emitQuestEvent('temple_survived', {});
              logMsg('<span style="color:var(--success)">🏺 You escape with the Golden Chalice!</span>');
            }
          }
        },

        spawn_genie_boss: function(data) {
          if(currentLevel === 10) {
            logMsg('<span style="color:var(--warning)">🧞 A powerful genie emerges from a brass bottle!</span>');
            logMsg('<span style="color:#888">🧞 "You have disturbed my slumber! Prepare to face my wrath!"</span>');
            let geniePos = findSpawnPosition();
            if(geniePos) {
              enemies.push({
                type: 'genie',
                x: geniePos.x, y: geniePos.y,
                stats: { icon: '🧞', hp: 100, maxHp: 100, damage: 15, isBig: true, name: 'Genie' }
              });
            }
          }
        }
      }
    });

    function findSpawnPosition() {
      if(!theMap || theMap.length === 0) return null;
      let attempts = 100;
      while(attempts-- > 0) {
        const x = Math.floor(Math.random() * mapW);
        const y = Math.floor(Math.random() * mapH);
        if(theMap[y] && isTileFloor(theMap[y][x])) {
          if(x !== player.x || y !== player.y) {
            const occupied = enemies.some(e => e.x === x && e.y === y);
            if(!occupied) return { x, y };
          }
        }
      }
      return null;
    }

    console.log("KQ5 Quest Pack loaded: 4 quests, 4 achievements");
  })();
