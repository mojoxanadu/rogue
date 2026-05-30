# Rogue JS Sound Generation Pipeline

This project uses an **offline asset-generation pipeline** for voice and sound effects.
The game itself never calls ElevenLabs at runtime.

## Files

- Core audio assets are bundled into `roguelike_assets.dat`
- Ambient loops are bundled into `roguelike_assets_ambient.dat`
- Arcade/minigame files are bundled into `roguelike_assets_arcade.dat`

Generated source audio files live in:

- `sounds/generated/voices/`
- `sounds/generated/sfx/`
- `music/`

## Local SDK Setup

Create and use the local venv:

```bash
cd /home/projects/roguelike
python3 -m venv .venv-eleven
.venv-eleven/bin/pip install elevenlabs python-dotenv
```

## Secret Loading

The generator reads the ElevenLabs key from one of:

1. `ELEVENLABS_API_KEY`
2. `ELEVEN_LABS_API_KEY`
3. `/home/projects/roguelike/secrets.env`

Expected `secrets.env` format:

```env
ELEVEN_LABS_API_key="..."
```

## Generate Apu Voice + SFX

```bash
cd /home/projects/roguelike
.venv-eleven/bin/python tools/generate_sound_assets.py
```

Options:

```bash
.venv-eleven/bin/python tools/generate_sound_assets.py --apu-only
.venv-eleven/bin/python tools/generate_sound_assets.py --sfx-only
```

## What gets generated

### Apu voice clips

The script generates deterministic MP3 clips for the Apu / Cousin Dave dialog states used most often in `shop.js`:

- store greetings
- Super Center intro
- ask-Apu family lines
- franchise dialog tree
- Larry easter egg interaction

Output format:

- `mp3_44100_128`

Voice:

- ElevenLabs voice ID: `N5d2d1s5cnuy6wghabpn`
- If the account plan cannot use that library voice through the API, the script
  automatically falls back to `JBFqnCBsd6RMkjVDRZzb` so generation can still proceed.

Model:

- `eleven_flash_v2_5`

### Common sound effects

Generated SFX targets the most frequently used events:

- `step`
- `clink`
- `sword`
- `grunt`
- `scream`
- `quack`
- `splash`
- `oof`
- `achieve`
- `error_buzz`
- `chest_open`

Output format:

- `mp3_22050_32`

Model:

- `eleven_text_to_sound_v2`

## Music loops

Drop or update area music in `/home/projects/roguelike/music/`.

Current expected filenames:

- `tristram.mp3`
- `ifrit lair.mp3`
- `dackard cain.mp3`
- `eagle crag.mp3`
- `fields.mp3`
- `supercenter.mp3`

The asset builder maps these to runtime keys:

- `music_tristram`
- `music_ifrit_lair`
- `music_deckard_cain`
- `music_eagle_crag`
- `music_fields`
- `music_supercenter`

## Rebuild bundles after generating audio

```bash
cd /home/projects/roguelike
python3 build_complete_assets.py
python3 build.py
```

## Runtime behavior

- `Sound.playMusic(name)` prefers a bundled sample loop `music_${name}` if available; otherwise it falls back to FM tracks.
- `Sound.playVoice(name)` plays a generated MP3 dialogue clip if present.
- common SFX methods (`step`, `clink`, etc.) prefer bundled generated MP3 clips and fall back to FM synthesis.

## Notes

- The game remains fully playable without generated audio.
- Missing clips simply fall back to synthesized sounds or silence.
- This design keeps the browser build offline-safe and avoids shipping API credentials.

## Dialog Tree Coverage Rule (Do Not Skip)

When adding or editing any NPC dialog tree:

1. **Every branch level must have a voice trigger** (not just the first screen).
2. **Multi-sentence responses must be fully covered**:
   - either one clip that matches the full on-screen response, or
   - staged clips that together match all sentences in order.
3. **No branch is allowed to silently regress** after text edits.

Before building, run a branch-coverage sanity check:

```bash
cd /home/projects/roguelike
python3 - <<'PY'
import re, pathlib
root=pathlib.Path('.')
src=(root/'src/shop.js').read_text()+"\n"+(root/'src/engine.js').read_text()
keys=set(re.findall(r"playVoiceClip\('([^']+)'\)",src))
keys.update(re.findall(r"Sound\.playVoice\('([^']+)'\)",src))
files={p.stem for p in (root/'sounds/generated/voices').rglob('*.mp3')}
missing=sorted(k for k in keys if k not in files)
print('voice keys:', len(keys))
print('missing keys:', len(missing))
for k in missing: print('MISSING', k)
PY
```

If `missing keys` is nonzero, generate those clips first, then rerun:

```bash
python3 build_complete_assets.py
python3 build.py
```
