"""The canonical source-file order for the build. Imported by build_html.py
and build_release.py. See BUILDS.md for why this order matters (quest packs
must register before quest_engine collects them, etc).
"""
FILES = [
    'header.html',
    'ui_layout.html',
    'audio.js',
    'music_data.js',
    'state.js',
    # Pure-data registries (no engine logic). Loaded early so
    # player.js and class-selection code can grant talents and
    # query spell levels without forward-reference gymnastics.
    'talents_def.js',
    'spells_def.js',
    # Item model classes (UX-agnostic). items.js defines the classes;
    # items_registry.js builds the camelCase-name registry from
    # state.js's LEGACY_ITEM_DATA table, so it must follow both.
    'items.js',
    'items_registry.js',
    # Entity hierarchy + World/Zone. UX-agnostic model classes.
    'entities.js',
    # World-bound loot abstraction. Lootable extends Entity (needs entities.js
    # loaded first). Phases 2-6 migrate the legacy itemsOnGround/corpse.loot/
    # CHEST-tile data through this.
    'loot.js',
    # NPC (Non-Player Creature) hierarchy. Subclass of Sentient.
    # Holds attitude + behavior + per-monster bookkeeping. Must load
    # after entities.js (extends Sentient) and before any file that
    # constructs NPCs (engine.js spawn sites, map.js town setup).
    'npc.js',
    'world.js',
    # Cooldown-based turn-loop driver. UX-agnostic; uses the Sentient
    # interface defined in entities.js. Wired into the game loop in
    # a follow-up commit; this commit defines + tests it in isolation.
    'scheduler.js',
    'player.js',
    'limerick_api.js',
    'ui_logic.js',
    # Dialog system (Andor's-Trail-style conversation trees). Loaded BEFORE
    # quest packs so packs can call Dialog.registerPhrases / injectReply in
    # their IIFEs. dialog.js has no deps; dialogs_base.js only needs Dialog.
    'dialog.js',
    'dialogs_base.js',
    'shop_dialog.js',
    # Quest packs BEFORE quest_engine (registration pattern)
    'quests_base.js',
    'quests_monkey_island.js',
    'quests_monty_python.js',
    'quests_black_cauldron.js',
    'quests_indiana_jones.js',
    'quests_kq5.js',
    'quests_zork.js',
    'quests_elder_scrolls.js',
    'quests_larry.js',
    'quests_space_quest.js',
    'quests_qfg.js',
    'quests_monty_python_bridge.js',
    'quests_kq5_genie.js',
    # Quest engine collects all registered packs
    'quest_engine.js',
    'boundary_data.js',
    'map.js',
    'mechanics.js',
    'engine.js',
    'shop.js',
    'webgl_fx.js',
    'render.js',
    'input.js',
]
