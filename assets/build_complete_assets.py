#!/usr/bin/env python3
"""
Build complete asset file with:
1. Base64 encoded simple colored rectangle sprites (fallback)
2. Valid MP3 sound placeholders
3. All required game assets
"""

import os
import json
import base64
from pathlib import Path


def embed_binary_file(data_dict, section, key, filepath, mime_type):
    with open(filepath, 'rb') as f:
        raw_data = f.read()
    b64_data = base64.b64encode(raw_data).decode('utf-8')
    data_dict[section][key] = f"data:{mime_type};base64,{b64_data}"
    return len(raw_data)

def create_simple_svg(color="#FFFFFF", width=32, height=32, name="sprite"):
    """Create a simple SVG rectangle as a placeholder sprite."""
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="{color}"/>
  <text x="50%" y="50%" font-family="Arial" font-size="12" fill="#000" 
        text-anchor="middle" dy=".3em">{name}</text>
</svg>'''
    return svg_content.encode('utf-8')

def create_detailed_svg(sprite_type, width=32, height=32):
    """Create a more detailed SVG sprite based on 90s 2D videogame art style."""
    
    # Base SVG template
    svg_template = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
  {content}
</svg>'''
    
    # Different sprite designs based on type
    if sprite_type == "skeleton":
        content = '''
  <!-- Skeleton body -->
  <rect x="12" y="8" width="8" height="8" fill="#C7C7C7" stroke="#333" stroke-width="1"/>
  <rect x="10" y="16" width="12" height="12" fill="#C7C7C7" stroke="#333" stroke-width="1"/>
  <!-- Skull details -->
  <circle cx="14" cy="11" r="1.5" fill="#333"/>
  <circle cx="18" cy="11" r="1.5" fill="#333"/>
  <rect x="14" y="14" width="4" height="1" fill="#333"/>
  <!-- Ribs -->
  <line x1="12" y1="18" x2="20" y2="18" stroke="#333" stroke-width="1"/>
  <line x1="12" y1="20" x2="20" y2="20" stroke="#333" stroke-width="1"/>
  <line x1="12" y1="22" x2="20" y2="22" stroke="#333" stroke-width="1"/>
  <!-- Arms -->
  <line x1="10" y1="18" x2="6" y2="22" stroke="#C7C7C7" stroke-width="2"/>
  <line x1="22" y1="18" x2="26" y2="22" stroke="#C7C7C7" stroke-width="2"/>
  <!-- Legs -->
  <line x1="14" y1="28" x2="12" y2="32" stroke="#C7C7C7" stroke-width="2"/>
  <line x1="18" y1="28" x2="20" y2="32" stroke="#C7C7C7" stroke-width="2"/>
'''
    
    elif sprite_type == "fence_closed":
        content = '''
  <!-- Fence with coat closed -->
  <rect x="8" y="8" width="16" height="24" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <!-- Coat -->
  <rect x="6" y="10" width="20" height="20" fill="#A0522D" stroke="#333" stroke-width="1"/>
  <!-- Buttons -->
  <circle cx="16" cy="14" r="1" fill="#333"/>
  <circle cx="16" cy="18" r="1" fill="#333"/>
  <circle cx="16" cy="22" r="1" fill="#333"/>
  <!-- Face -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <circle cx="15" cy="7" r="1" fill="#333"/>
  <circle cx="17" cy="7" r="1" fill="#333"/>
  <rect x="15" y="9" width="2" height="1" fill="#333"/>
'''
    
    elif sprite_type == "fence_flasher":
        content = '''
  <!-- Fence with coat open (flasher) -->
  <rect x="8" y="8" width="16" height="24" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <!-- Open coat -->
  <path d="M6,10 L16,30 L26,10" fill="none" stroke="#A0522D" stroke-width="2"/>
  <path d="M6,10 L16,30 L26,10" fill="#A0522D" opacity="0.7"/>
  <!-- Face -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <circle cx="15" cy="7" r="1" fill="#333"/>
  <circle cx="17" cy="7" r="1" fill="#333"/>
  <rect x="15" y="9" width="2" height="1" fill="#333"/>
  <!-- Wink -->
  <line x1="14" y1="7" x2="16" y2="7" stroke="#333" stroke-width="1"/>
'''
    
    elif sprite_type == "cain":
        content = '''
  <!-- Deckard Cain -->
  <rect x="8" y="8" width="16" height="24" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <!-- Robe -->
  <rect x="6" y="10" width="20" height="20" fill="#4A235A" stroke="#333" stroke-width="1"/>
  <!-- Beard -->
  <path d="M12,12 Q16,20 20,12" fill="#D5D8DC" stroke="#333" stroke-width="1"/>
  <!-- Face -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <circle cx="15" cy="7" r="1" fill="#333"/>
  <circle cx="17" cy="7" r="1" fill="#333"/>
  <!-- Staff -->
  <line x1="24" y1="10" x2="24" y2="30" stroke="#8B4513" stroke-width="2"/>
  <circle cx="24" cy="10" r="2" fill="#F1C40F"/>
'''
    
    elif sprite_type == "troll":
        content = '''
  <!-- Troll -->
  <rect x="8" y="8" width="16" height="24" fill="#588C7E" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="6" fill="#588C7E" stroke="#333" stroke-width="1"/>
  <!-- Eyes -->
  <circle cx="14" cy="7" r="2" fill="#F1C40F"/>
  <circle cx="18" cy="7" r="2" fill="#F1C40F"/>
  <circle cx="14" cy="7" r="1" fill="#333"/>
  <circle cx="18" cy="7" r="1" fill="#333"/>
  <!-- Mouth -->
  <path d="M12,10 Q16,12 20,10" fill="none" stroke="#333" stroke-width="1"/>
  <!-- Arms -->
  <rect x="4" y="12" width="4" height="12" fill="#588C7E" stroke="#333" stroke-width="1"/>
  <rect x="24" y="12" width="4" height="12" fill="#588C7E" stroke="#333" stroke-width="1"/>
  <!-- Legs -->
  <rect x="10" y="32" width="4" height="4" fill="#588C7E" stroke="#333" stroke-width="1"/>
  <rect x="18" y="32" width="4" height="4" fill="#588C7E" stroke="#333" stroke-width="1"/>
'''
    
    elif sprite_type == "pirate":
        content = '''
  <!-- Pirate -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Hat -->
  <path d="M10,6 L16,2 L22,6" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Eye patch -->
  <circle cx="18" cy="8" r="2" fill="#333"/>
  <line x1="16" y1="6" x2="20" y2="4" stroke="#333" stroke-width="1"/>
  <!-- Beard -->
  <path d="M12,10 Q16,16 20,10" fill="#333" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="24" y1="12" x2="28" y2="8" stroke="#C0C0C0" stroke-width="2"/>
  <line x1="24" y1="12" x2="24" y2="16" stroke="#8B4513" stroke-width="2"/>
'''
    
    elif sprite_type == "master":
        content = '''
  <!-- Swordmaster -->
  <rect x="8" y="8" width="16" height="24" fill="#E74C3C" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Hat -->
  <path d="M12,6 L16,2 L20,6" fill="#E74C3C" stroke="#333" stroke-width="1"/>
  <!-- Mustache -->
  <path d="M14,10 Q16,12 18,10" fill="none" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="24" y1="10" x2="28" y2="6" stroke="#C0C0C0" stroke-width="2"/>
  <line x1="24" y1="10" x2="24" y2="14" stroke="#8B4513" stroke-width="2"/>
  <!-- Cape -->
  <path d="M8,12 Q12,20 8,28" fill="#E74C3C" stroke="#333" stroke-width="1"/>
'''
    
    elif sprite_type == "genie":
        content = '''
  <!-- Genie -->
  <rect x="8" y="8" width="16" height="24" fill="#3498DB" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Turban -->
  <ellipse cx="16" cy="6" rx="6" ry="3" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <!-- Eyes -->
  <circle cx="15" cy="7" r="1" fill="#333"/>
  <circle cx="17" cy="7" r="1" fill="#333"/>
  <!-- Smile -->
  <path d="M14,9 Q16,11 18,9" fill="none" stroke="#333" stroke-width="1"/>
  <!-- Smoke trail -->
  <path d="M16,32 Q12,28 16,24 Q20,20 16,16" fill="none" stroke="#BDC3C7" stroke-width="2" stroke-dasharray="2,2"/>
'''
    
    elif sprite_type == "king":
        content = '''
  <!-- King -->
  <rect x="8" y="8" width="16" height="24" fill="#9B59B6" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Crown -->
  <path d="M10,6 L12,2 L14,6 L16,2 L18,6 L20,2 L22,6" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <!-- Beard -->
  <path d="M12,10 Q16,18 20,10" fill="#D5D8DC" stroke="#333" stroke-width="1"/>
  <!-- Robe -->
  <rect x="6" y="12" width="20" height="16" fill="#9B59B6" stroke="#333" stroke-width="1"/>
  <!-- Scepter -->
  <line x1="24" y1="12" x2="24" y2="24" stroke="#F1C40F" stroke-width="2"/>
  <circle cx="24" cy="12" r="2" fill="#E74C3C"/>
'''
    
    elif sprite_type == "assassin":
        content = '''
  <!-- Assassin -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Hood -->
  <path d="M10,8 L16,4 L22,8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Mask -->
  <rect x="12" y="6" width="8" height="4" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Eyes -->
  <circle cx="14" cy="8" r="1" fill="#E74C3C"/>
  <circle cx="18" cy="8" r="1" fill="#E74C3C"/>
  <!-- Daggers -->
  <line x1="6" y1="12" x2="10" y2="16" stroke="#C0C0C0" stroke-width="2"/>
  <line x1="26" y1="12" x2="22" y2="16" stroke="#C0C0C0" stroke-width="2"/>
'''
    
    elif sprite_type == "black_knight_4limbs":
        content = '''
  <!-- Black Knight (4 limbs) -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Helmet -->
  <rect x="10" y="4" width="12" height="8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Visor -->
  <rect x="12" y="6" width="8" height="2" fill="#1A252F"/>
  <!-- Arms -->
  <rect x="4" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <rect x="24" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Legs -->
  <rect x="10" y="32" width="4" height="4" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <rect x="18" y="32" width="4" height="4" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="28" y1="8" x2="28" y2="20" stroke="#C0C0C0" stroke-width="2"/>
'''
    
    elif sprite_type == "black_knight_3limbs":
        content = '''
  <!-- Black Knight (3 limbs) -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Helmet -->
  <rect x="10" y="4" width="12" height="8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Visor -->
  <rect x="12" y="6" width="8" height="2" fill="#1A252F"/>
  <!-- Arms -->
  <rect x="4" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <rect x="24" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Legs (one missing) -->
  <rect x="10" y="32" width="4" height="4" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="28" y1="8" x2="28" y2="20" stroke="#C0C0C0" stroke-width="2"/>
'''
    
    elif sprite_type == "black_knight_2limbs":
        content = '''
  <!-- Black Knight (2 limbs) -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Helmet -->
  <rect x="10" y="4" width="12" height="8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Visor -->
  <rect x="12" y="6" width="8" height="2" fill="#1A252F"/>
  <!-- Arms (one missing) -->
  <rect x="4" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Legs (one missing) -->
  <rect x="10" y="32" width="4" height="4" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="28" y1="8" x2="28" y2="20" stroke="#C0C0C0" stroke-width="2"/>
'''
    
    elif sprite_type == "black_knight_1limb":
        content = '''
  <!-- Black Knight (1 limb) -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Helmet -->
  <rect x="10" y="4" width="12" height="8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Visor -->
  <rect x="12" y="6" width="8" height="2" fill="#1A252F"/>
  <!-- One arm -->
  <rect x="4" y="10" width="4" height="12" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Sword -->
  <line x1="28" y1="8" x2="28" y2="20" stroke="#C0C0C0" stroke-width="2"/>
'''
    
    elif sprite_type == "black_knight_0limbs":
        content = '''
  <!-- Black Knight (0 limbs) -->
  <rect x="8" y="8" width="16" height="24" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Helmet -->
  <rect x="10" y="4" width="12" height="8" fill="#2C3E50" stroke="#333" stroke-width="1"/>
  <!-- Visor -->
  <rect x="12" y="6" width="8" height="2" fill="#1A252F"/>
  <!-- No limbs -->
'''
    
    elif sprite_type == "french_taunter":
        content = '''
  <!-- French Taunter -->
  <rect x="8" y="8" width="16" height="24" fill="#3498DB" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Beret -->
  <ellipse cx="16" cy="6" rx="5" ry="2" fill="#E74C3C" stroke="#333" stroke-width="1"/>
  <!-- Mustache -->
  <path d="M14,10 Q16,12 18,10" fill="none" stroke="#333" stroke-width="1"/>
  <!-- Goatee -->
  <path d="M16,12 L16,14" stroke="#333" stroke-width="1"/>
  <!-- Arms gesturing -->
  <line x1="8" y1="12" x2="4" y2="8" stroke="#FDBF6F" stroke-width="2"/>
  <line x1="24" y1="12" x2="28" y2="8" stroke="#FDBF6F" stroke-width="2"/>
'''
    
    elif sprite_type == "bridge_keeper":
        content = '''
  <!-- Bridge Keeper -->
  <rect x="8" y="8" width="16" height="24" fill="#6C5B7B" stroke="#333" stroke-width="1"/>
  <!-- Head -->
  <circle cx="16" cy="8" r="4" fill="#FDBF6F" stroke="#333" stroke-width="1"/>
  <!-- Hood -->
  <path d="M10,8 L16,4 L22,8" fill="#6C5B7B" stroke="#333" stroke-width="1"/>
  <!-- Eyes -->
  <circle cx="15" cy="7" r="1" fill="#333"/>
  <circle cx="17" cy="7" r="1" fill="#333"/>
  <!-- Staff -->
  <line x1="24" y1="8" x2="24" y2="24" stroke="#8B4513" stroke-width="2"/>
  <circle cx="24" cy="8" r="2" fill="#F1C40F"/>
'''
    
    elif sprite_type == "chest_closed":
        content = '''
  <!-- Chest (closed) -->
  <rect x="6" y="12" width="20" height="16" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <rect x="6" y="8" width="20" height="8" fill="#A0522D" stroke="#333" stroke-width="1"/>
  <!-- Lock -->
  <rect x="14" y="16" width="4" height="4" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <circle cx="16" cy="18" r="1" fill="#333"/>
  <!-- Bands -->
  <line x1="6" y1="16" x2="26" y2="16" stroke="#333" stroke-width="1"/>
  <line x1="6" y1="20" x2="26" y2="20" stroke="#333" stroke-width="1"/>
'''
    
    elif sprite_type == "chest_open":
        content = '''
  <!-- Chest (open) -->
  <rect x="6" y="16" width="20" height="12" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <path d="M6,16 L6,8 L26,8 L26,16" fill="#A0522D" stroke="#333" stroke-width="1"/>
  <!-- Inside -->
  <rect x="8" y="18" width="16" height="8" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <!-- Gold coins -->
  <circle cx="12" cy="20" r="2" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <circle cx="16" cy="22" r="2" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <circle cx="20" cy="20" r="2" fill="#F1C40F" stroke="#333" stroke-width="1"/>
'''
    
    elif sprite_type == "bookstore":
        content = '''
  <!-- Bookstore -->
  <rect x="4" y="8" width="24" height="20" fill="#8B4513" stroke="#333" stroke-width="1"/>
  <!-- Books -->
  <rect x="6" y="10" width="4" height="16" fill="#E74C3C" stroke="#333" stroke-width="1"/>
  <rect x="10" y="10" width="4" height="16" fill="#3498DB" stroke="#333" stroke-width="1"/>
  <rect x="14" y="10" width="4" height="16" fill="#2ECC71" stroke="#333" stroke-width="1"/>
  <rect x="18" y="10" width="4" height="16" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <rect x="22" y="10" width="4" height="16" fill="#9B59B6" stroke="#333" stroke-width="1"/>
  <!-- Sign -->
  <rect x="8" y="4" width="16" height="4" fill="#F1C40F" stroke="#333" stroke-width="1"/>
  <text x="16" y="7" font-family="Arial" font-size="3" fill="#333" text-anchor="middle">BOOKS</text>
'''
    
    elif sprite_type == "water_tessellating":
        content = '''
  <!-- Water (tessellating) -->
  <rect width="100%" height="100%" fill="#74B9FF"/>
  <!-- Waves -->
  <path d="M0,8 Q8,4 16,8 T32,8" fill="none" stroke="#3498DB" stroke-width="2"/>
  <path d="M0,16 Q8,12 16,16 T32,16" fill="none" stroke="#3498DB" stroke-width="2"/>
  <path d="M0,24 Q8,20 16,24 T32,24" fill="none" stroke="#3498DB" stroke-width="2"/>
  <!-- Sparkles -->
  <circle cx="8" cy="6" r="1" fill="#FFFFFF"/>
  <circle cx="24" cy="14" r="1" fill="#FFFFFF"/>
  <circle cx="12" cy="22" r="1" fill="#FFFFFF"/>
'''
    
    elif sprite_type == "sand_tessellating":
        content = '''
  <!-- Sand (tessellating) -->
  <rect width="100%" height="100%" fill="#F4D03F"/>
  <!-- Sand texture -->
  <circle cx="4" cy="4" r="1" fill="#D4AC0D"/>
  <circle cx="12" cy="8" r="1" fill="#D4AC0D"/>
  <circle cx="20" cy="4" r="1" fill="#D4AC0D"/>
  <circle cx="28" cy="12" r="1" fill="#D4AC0D"/>
  <circle cx="8" cy="16" r="1" fill="#D4AC0D"/>
  <circle cx="16" cy="20" r="1" fill="#D4AC0D"/>
  <circle cx="24" cy="24" r="1" fill="#D4AC0D"/>
  <circle cx="4" cy="28" r="1" fill="#D4AC0D"/>
  <circle cx="12" cy="28" r="1" fill="#D4AC0D"/>
  <circle cx="28" cy="28" r="1" fill="#D4AC0D"/>
'''
    
    elif sprite_type == "duck_hunt_dog":
        content = '''
  <!-- Duck Hunt Dog - Laughing pose with duck -->
  <!-- Green grass base -->
  <rect x="0" y="20" width="32" height="12" fill="#4CAF50"/>
  <rect x="0" y="22" width="32" height="10" fill="#388E3C"/>
  <!-- Grass tufts -->
  <path d="M2,20 L4,16 L6,20" fill="#66BB6A"/>
  <path d="M10,20 L12,14 L14,20" fill="#66BB6A"/>
  <path d="M18,20 L20,15 L22,20" fill="#66BB6A"/>
  <path d="M26,20 L28,16 L30,20" fill="#66BB6A"/>
  
  <!-- Dog body (popping up from grass) -->
  <rect x="8" y="14" width="16" height="12" fill="#D2691E" stroke="#8B4513" stroke-width="1"/>
  <!-- White chest/belly -->
  <rect x="12" y="18" width="8" height="8" fill="#FFFFFF"/>
  
  <!-- Dog head -->
  <rect x="10" y="4" width="12" height="10" fill="#D2691E" stroke="#8B4513" stroke-width="1"/>
  <!-- Ears (pointed up) -->
  <polygon points="10,4 8,0 12,4" fill="#8B4513"/>
  <polygon points="22,4 24,0 20,4" fill="#8B4513"/>
  <!-- White muzzle -->
  <rect x="12" y="8" width="8" height="6" fill="#FFFFFF"/>
  <!-- Nose -->
  <ellipse cx="16" cy="8" rx="2" ry="1.5" fill="#2C2C2C"/>
  <!-- Eyes (squinted/laughing) -->
  <path d="M11,5 Q13,4 15,5" stroke="#2C2C2C" stroke-width="1.5" fill="none"/>
  <path d="M17,5 Q19,4 21,5" stroke="#2C2C2C" stroke-width="1.5" fill="none"/>
  <!-- Mouth (open laughing) -->
  <path d="M13,11 Q16,14 19,11" stroke="#2C2C2C" stroke-width="1" fill="#FF6B6B"/>
  
  <!-- Duck in dog's mouth -->
  <ellipse cx="4" cy="16" rx="4" ry="3" fill="#FFD700"/>
  <circle cx="2" cy="14" r="2" fill="#FFD700"/>
  <!-- Duck beak -->
  <polygon points="0,14 2,16 0,16" fill="#FF8C00"/>
  <!-- Duck eye -->
  <circle cx="1" cy="14" r="0.5" fill="#000"/>
  <!-- Duck wing -->
  <ellipse cx="5" cy="16" rx="2" ry="1.5" fill="#DAA520"/>
  
  <!-- "HA HA HA" text -->
  <text x="28" y="8" font-family="Arial" font-size="4" fill="#FF0000" font-weight="bold">HA!</text>
'''
    
    else:
        # Default simple sprite
        return create_simple_svg("#FFFFFF", width, height, sprite_type)
    
    return svg_template.format(width=width, height=height, content=content).encode('utf-8')

def create_minimal_mp3():
    """Create a minimal valid MP3 frame (silent)."""
    # Very basic MP3 header for a silent frame
    return bytes([
        0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])

def build_assets():
    """Build all assets in memory, then split into core/ambient/arcade bundles."""
    assets = {
        "sprites": {},
        "sounds": {},
        "midi": {},
        "minigames": {}
    }
    
    print("Building complete asset file...")
    
    # Create sprites directory if needed
    os.makedirs('sprites', exist_ok=True)
    os.makedirs('sounds', exist_ok=True)
    
    # Define all sprites needed based on game data
    sprite_definitions = {
        # Monsters
        "player": {"color": "#FF6B6B", "name": "Player"},
        "slime": {"color": "#4ECDC4", "name": "Slime"},
        "skeleton": {"color": "#C7C7C7", "name": "Skeleton", "detailed": "skeleton"},
        "bat": {"color": "#6C5B7B", "name": "Bat"},
        "ghost": {"color": "#F8F9FA", "name": "Ghost"},
        "robot": {"color": "#45B7D1", "name": "Robot"},
        "dragon": {"color": "#FF9A76", "name": "Dragon"},
        "snake": {"color": "#96CEB4", "name": "Snake"},
        "troll": {"color": "#588C7E", "name": "Troll", "detailed": "troll"},
        "medusa": {"color": "#9E579D", "name": "Medusa"},
        "assassin": {"color": "#2C3E50", "name": "Assassin", "detailed": "assassin"},
        "killer_rabbit": {"color": "#FFEAA7", "name": "Rabbit"},
        
        # NPCs
        "thief": {"color": "#636E72", "name": "Thief"},
        "fence": {"color": "#A29BFE", "name": "Fence", "detailed": "fence_closed"},
        "fence_flasher": {"color": "#A29BFE", "name": "Fence Flasher", "detailed": "fence_flasher"},
        "cain": {"color": "#FDCB6E", "name": "Cain", "detailed": "cain"},
        "pirate": {"color": "#00B894", "name": "Pirate", "detailed": "pirate"},
        "master": {"color": "#E17055", "name": "Master", "detailed": "master"},
        "cat": {"color": "#FF7675", "name": "Cat"},
        "genie": {"color": "#74B9FF", "name": "Genie", "detailed": "genie"},
        "king": {"color": "#FDCB6E", "name": "King", "detailed": "king"},
        "eagle": {"color": "#636E72", "name": "Eagle"},
        "gurgi": {"color": "#A29BFE", "name": "Gurgi"},
        "erasmus": {"color": "#6C5B7B", "name": "Erasmus"},
        "cow": {"color": "#FFFFFF", "name": "Cow"},
        "black_knight": {"color": "#2D3436", "name": "Knight", "detailed": "black_knight_4limbs"},
        "black_knight_4limbs": {"color": "#2D3436", "name": "Knight 4 Limbs", "detailed": "black_knight_4limbs"},
        "black_knight_3limbs": {"color": "#2D3436", "name": "Knight 3 Limbs", "detailed": "black_knight_3limbs"},
        "black_knight_2limbs": {"color": "#2D3436", "name": "Knight 2 Limbs", "detailed": "black_knight_2limbs"},
        "black_knight_1limb": {"color": "#2D3436", "name": "Knight 1 Limb", "detailed": "black_knight_1limb"},
        "black_knight_0limbs": {"color": "#2D3436", "name": "Knight 0 Limbs", "detailed": "black_knight_0limbs"},
        "french_taunter": {"color": "#0984E3", "name": "Taunter", "detailed": "french_taunter"},
        "dennis": {"color": "#00B894", "name": "Dennis"},
        "bridge_keeper": {"color": "#6C5B7B", "name": "Keeper", "detailed": "bridge_keeper"},
        "chipmunk": {"color": "#D63031", "name": "Chipmunk"},
        "duck": {"color": "#FFD700", "name": "Duck"},
        "shark": {"color": "#2196F3", "name": "Shark"},
        "wet_rat": {"color": "#795548", "name": "Wet Rat"},
        "duck_hunt_dog": {"color": "#D2691E", "name": "Duck Hunt Dog", "detailed": "duck_hunt_dog"},
        
        # Tiles
        "wall": {"color": "#636E72", "name": "Wall"},
        "floor": {"color": "#DFE6E9", "name": "Floor"},
        "water": {"color": "#74B9FF", "name": "Water", "detailed": "water_tessellating"},
        "sand": {"color": "#FFEAA7", "name": "Sand", "detailed": "sand_tessellating"},
        "grass": {"color": "#00B894", "name": "Grass"},
        "tree": {"color": "#00B894", "name": "Tree"},
        "rock": {"color": "#636E72", "name": "Rock"},
        "chest_closed": {"color": "#8B4513", "name": "Chest Closed", "detailed": "chest_closed"},
        "chest_open": {"color": "#8B4513", "name": "Chest Open", "detailed": "chest_open"},
        "bookstore": {"color": "#8B4513", "name": "Bookstore", "detailed": "bookstore"},
        
        # Items (using emoji keys)
        "💣🌟": {"color": "#FF7675", "name": "Grenade"},
        "🧪": {"color": "#FD79A8", "name": "Potion"},
        "🗡️": {"color": "#636E72", "name": "Sword"},
        "🛡️": {"color": "#FDCB6E", "name": "Shield"},
        "💰": {"color": "#FDCB6E", "name": "Gold"},
    }
    
    # Create sprites
    print("\nCreating sprites...")
    
    # Load selections
    import json
    selections = {}
    try:
        with open('selections.json', 'r') as f:
            selections = json.load(f)
            print(f"Loaded {len(selections)} sprite selections: {list(selections.keys())[:5]}...")
    except FileNotFoundError:
        print("No selections.json found, using default sprites")
    except Exception as e:
        print(f"Error loading selections.json: {e}")

    for sprite_key, config in sprite_definitions.items():
        if sprite_key in selections:
            sel = selections[sprite_key]
            if sel['source'] == 'emoji':
                # Embed emoji in SVG
                emoji = sel['path']
                svg_data = f'<?xml version="1.0" encoding="UTF-8"?><svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24">{emoji}</text></svg>'.encode('utf-8')
                b64_data = base64.b64encode(svg_data).decode('utf-8')
                assets['sprites'][sprite_key] = f"data:image/svg+xml;base64,{b64_data}"
                print(f"Using {sel['source']} sprite for {sprite_key}: {sel['path']}")
            elif sel['source'] in ['lpc', 'crawl', 'andor']:
                # Map source to directory
                src_dirs = {
                    'lpc': 'external/lpc-spritesheet',
                    'crawl': 'external/crawl/crawl-ref/source/rltiles',
                    'andor': 'external/andors-trail/AndorsTrail/res/drawable'
                }
                src_dir = src_dirs.get(sel['source'])
                if src_dir:
                    img_path = os.path.join(src_dir, sel['path'])
                    if os.path.exists(img_path):
                        with open(img_path, 'rb') as img_file:
                            img_data = img_file.read()
                        b64_data = base64.b64encode(img_data).decode('utf-8')
                        # Determine mime type
                        ext = os.path.splitext(img_path)[1].lower()
                        mime = 'image/png' if ext == '.png' else 'image/jpeg' if ext in ['.jpg', '.jpeg'] else 'image/gif' if ext == '.gif' else 'application/octet-stream'
                        assets['sprites'][sprite_key] = f"data:{mime};base64,{b64_data}"
                        print(f"Using {sel['source']} sprite for {sprite_key}: {sel['path']}")
                    else:
                        print(f"Warning: Selected image not found: {img_path}")
                        # Fallback to default
                        if "detailed" in config:
                            svg_data = create_detailed_svg(config["detailed"], 32, 32)
                        else:
                            svg_data = create_simple_svg(config["color"], 32, 32, config["name"])
                        b64_data = base64.b64encode(svg_data).decode('utf-8')
                        assets['sprites'][sprite_key] = f"data:image/svg+xml;base64,{b64_data}"
                else:
                    print(f"Warning: Unknown source {sel['source']} for {sprite_key}")
            elif sel['source'] == 'color':
                # Use color
                color = sel['path']
                svg_data = create_simple_svg(color, 32, 32, sprite_key)
                b64_data = base64.b64encode(svg_data).decode('utf-8')
                assets['sprites'][sprite_key] = f"data:image/svg+xml;base64,{b64_data}"
        else:
            # Default generation
            if "detailed" in config:
                svg_data = create_detailed_svg(config["detailed"], 32, 32)
            else:
                svg_data = create_simple_svg(config["color"], 32, 32, config["name"])
            b64_data = base64.b64encode(svg_data).decode('utf-8')
            assets['sprites'][sprite_key] = f"data:image/svg+xml;base64,{b64_data}"
        
        # Also save as PNG file (placeholder, as we don't have real PNG generation here)
        png_filename = f"sprites/{sprite_key.replace(':', '_').replace('/', '_')}.png"
        with open(png_filename, 'wb') as f:
            f.write(b'PNG placeholder')
        
        print(f"  ✓ {config['name']:12} -> {sprite_key}")
    
    # ── WARRIOR SPRITE SHEETS ──
    # Loaded into the in-memory build, but excluded from the default core bundle
    # to keep the offline loader small. Avatar currently uses emoji.
    warrior_sheets = {
        'warrior_walk': 'warrior-walk.png',
        'warrior_run':  'warrior-run.png',
        'warrior_sleep': 'warrior-sleep.png',
        'warrior_fight': 'warrior-fight.png',
    }
    print("\nLoading warrior sprite sheets...")
    for key, filename in warrior_sheets.items():
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                png_data = f.read()
            b64_data = base64.b64encode(png_data).decode('utf-8')
            assets['sprites'][key] = f"data:image/png;base64,{b64_data}"
            print(f"  ✓ {key:16} <- {filename} ({len(png_data)//1024}KB)")
        else:
            print(f"  ✗ {filename} not found, skipping")

    # ── TALKING HEAD GIFs ──
    gif_heads = {
        'npc_apu':      'gifs/apu.gif',
        'npc_wizard':   'gifs/wizard.gif',
        'npc_chaplain': 'gifs/chaplain.gif',
        # Static regular portraits for individual Mended Drum chats
        'npc_cohen':          'gifs/regulars/cohen.png',
        'npc_vimes':          'gifs/regulars/commander vimes.png',
        'npc_librarian':      'gifs/regulars/librarian.png',
        'npc_bearded_dwarf':  'gifs/regulars/dwarf woman.png',
        # Modal backfill portraits
        'npc_thief_modal':        'gifs/modal_backfill/thief.png',
        'npc_bridgekeeper_modal': 'gifs/modal_backfill/bridgekeeper.png',
        'npc_swordmaster_modal':  'gifs/modal_backfill/swordmaster.png',
        'npc_lowly_pirate_1':     'gifs/modal_backfill/lowly_pirate_1.png',
        'npc_lowly_pirate_2':     'gifs/modal_backfill/lowly_pirate_2.png',
        'npc_lowly_pirate_3':     'gifs/modal_backfill/lowly_pirate_3.png',
        'npc_lowly_pirate_4':     'gifs/modal_backfill/lowly_pirate_4.png',
        'npc_lowly_pirate_5':     'gifs/modal_backfill/lowly_pirate_5.png',
        'npc_scummbar_modal':     'gifs/modal_backfill/scumm_bar.png',
    }
    print("\nLoading talking head portraits...")
    for key, filename in gif_heads.items():
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                img_data = f.read()
            b64_data = base64.b64encode(img_data).decode('utf-8')
            ext = os.path.splitext(filename)[1].lower()
            mime = 'image/png' if ext == '.png' else 'image/gif'
            assets['sprites'][key] = f"data:{mime};base64,{b64_data}"
            print(f"  ✓ {key:16} <- {filename} ({len(img_data)//1024}KB)")
        else:
            print(f"  ✗ {filename} not found, skipping")
    
    # ── BACKGROUND IMAGES ──
    backgrounds = {
        'bg_eagle_s_crag':     ('eagle_s_crag.png', 'image/png'),
        'bg_hall_of_champions': ('hall_of_champions.png', 'image/png'),
        'bg_roc_nest':         ('roc_nest.jpg', 'image/jpeg'),
    }
    print("\nLoading background images...")
    for key, (filename, mime_type) in backgrounds.items():
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                img_data = f.read()
            b64_data = base64.b64encode(img_data).decode('utf-8')
            assets['sprites'][key] = f"data:{mime_type};base64,{b64_data}"
            print(f"  ✓ {key:24} <- {filename} ({len(img_data)//1024}KB)")
        else:
            print(f"  ✗ {filename} not found, skipping")
    
    # Create sounds
    print("\nCreating sounds...")
    sound_definitions = {
        'step': 'Footstep',
        'grunt': 'Grunt',
        'scream': 'Scream',
        'clink': 'Clink',
        'sword': 'Sword',
        'splash': 'Splash',
        'quack': 'Quack',
        'squeak': 'Squeak',
        'oof': 'Oof',
        'snore': 'Snore',
        'ambient': 'Ambient',
    }
    
    for sound_name, description in sound_definitions.items():
        mp3_data = create_minimal_mp3()
        b64_data = base64.b64encode(mp3_data).decode('utf-8')
        assets['sounds'][sound_name] = f"data:audio/mp3;base64,{b64_data}"
        
        # Save MP3 file
        mp3_filename = f"sounds/{sound_name}.mp3"
        with open(mp3_filename, 'wb') as f:
            f.write(mp3_data)

        print(f"  ✓ {description:12} -> {sound_name}.mp3 ({len(mp3_data)} bytes)")

    # Optional one-off SFX files from project root
    extra_sound_files = {
        'whoopie': 'whhopie.mp3',
    }
    for asset_key, filepath in extra_sound_files.items():
        if os.path.exists(filepath):
            size = embed_binary_file(assets, 'sounds', asset_key, filepath, 'audio/mpeg')
            print(f"  ✓ {asset_key:12} -> {filepath} ({size // 1024} KB)")
        else:
            print(f"  ⚠  {asset_key:12} -> {filepath} NOT FOUND")

    # ── GENERATED SFX OVERRIDES ──
    generated_sfx_dir = Path('sounds/generated/sfx')
    if generated_sfx_dir.exists():
        print("\nEmbedding generated SFX overrides...")
        for mp3 in sorted(generated_sfx_dir.glob('*.mp3')):
            key = mp3.stem
            size = embed_binary_file(assets, 'sounds', key, mp3, 'audio/mpeg')
            print(f"  ✓ {key:20} -> {mp3} ({size // 1024} KB)")

    # ── GENERATED VOICE CLIPS ──
    generated_voice_dir = Path('sounds/generated/voices')
    if generated_voice_dir.exists():
        print("\nEmbedding generated voice clips...")
        for mp3 in sorted(generated_voice_dir.rglob('*.mp3')):
            key = mp3.stem
            size = embed_binary_file(assets, 'sounds', key, mp3, 'audio/mpeg')
            print(f"  ✓ {key:20} -> {mp3} ({size // 1024} KB)")

    # ── MUSIC LOOP SAMPLES ──
    music_files = {
        'music_tristram':    'music/tristram.mp3',
        'music_ifrit_lair':  'music/ifrit lair.mp3',
        'music_deckard_cain':'music/dackard cain.mp3',
        'music_eagle_crag':  'music/eagle crag.mp3',
        'music_fields':      'music/fields.mp3',
        'music_supercenter': 'music/supercenter.mp3',
        'music_pirate':      'music/pirate theme.mp3',
        'music_bandit':      'music/bandit camp.mp3',
    }
    print("\nEmbedding music loop samples...")
    for asset_key, filepath in music_files.items():
        if os.path.exists(filepath):
            size = embed_binary_file(assets, 'sounds', asset_key, filepath, 'audio/mpeg')
            print(f"  ✓ {asset_key:20} -> {filepath} ({size // 1024} KB)")
        else:
            print(f"  ⚠  {asset_key:20} -> {filepath} NOT FOUND")

    # ── REAL AMBIENT AUDIO FILES ──
    # Embed actual OGG files from the sounds/ directory for scene ambience.
    # The asset key is ambient_{scenename} and is looked up by Sound.playAmbient().
    ambient_files = {
        'ambient_dungeon': 'sounds/dungeon_ambient.ogg',
        'ambient_desert':  'sounds/desert_ambient.mp3',
        'ambient_beach':   'sounds/beach_ambient.mp3',
        'ambient_forest':  'sounds/forest_ambient.mp3',
    }

    print("\nEmbedding ambient audio files...")
    for asset_key, filepath in ambient_files.items():
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                raw_data = f.read()
            b64_data = base64.b64encode(raw_data).decode('utf-8')
            # Use correct MIME type based on file extension
            mime_type = 'audio/ogg' if filepath.endswith('.ogg') else 'audio/mp3'
            assets['sounds'][asset_key] = f"data:{mime_type};base64,{b64_data}"
            size_kb = len(raw_data) // 1024
            print(f"  ✓ {asset_key:20} -> {filepath} ({size_kb} KB)")
        else:
            print(f"  ⚠  {asset_key:20} -> {filepath} NOT FOUND (synth fallback will be used)")
    
    # ── ASTROCHICKEN MINIGAME ──
    # Embed the Ms. Astro Chicken WebAssembly game for Lefty's Bar arcade cabinet
    print("\nEmbedding Astrochicken minigame...")
    astrochicken_files = {
        'astrochicken/index.html': 'astrochicken/index.html',
        'astrochicken/wasm_exec.js': 'astrochicken/wasm_exec.js',
        'astrochicken/msastrochicken.wasm': 'astrochicken/msastrochicken.wasm'
    }
    
    for asset_key, filepath in astrochicken_files.items():
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                raw_data = f.read()
            b64_data = base64.b64encode(raw_data).decode('utf-8')
            # Determine MIME type
            if filepath.endswith('.html'):
                mime_type = 'text/html'
            elif filepath.endswith('.js'):
                mime_type = 'application/javascript'
            elif filepath.endswith('.wasm'):
                mime_type = 'application/wasm'
            else:
                mime_type = 'application/octet-stream'
            assets['minigames'][asset_key] = f"data:{mime_type};base64,{b64_data}"
            size_kb = len(raw_data) // 1024
            print(f"  ✓ {asset_key:30} -> {size_kb} KB")
        else:
            print(f"  ⚠  {asset_key:30} -> NOT FOUND")

    # ── CENTIPEDE ARCADE FILE ──
    centipede_path = 'centipede.html'
    print("\nEmbedding Centipede arcade page...")
    if os.path.exists(centipede_path):
        with open(centipede_path, 'rb') as f:
            raw_data = f.read()
        b64_data = base64.b64encode(raw_data).decode('utf-8')
        assets['minigames']['centipede/index.html'] = f"data:text/html;base64,{b64_data}"
        print(f"  ✓ {'centipede/index.html':30} -> {len(raw_data)//1024} KB")
    else:
        print(f"  ⚠  {'centipede/index.html':30} -> NOT FOUND")

    # ── NPC DIALOG MOVIES ──
    # Embedded as base64 video/mp4 data URLs. Stored with ambient audio in a
    # combined bundle so the start screen needs 3 slots instead of 4.
    movie_files = {
        'movie_apu':          'movies/apu.mp4',
        'movie_cain':         'movies/deckard cane.mp4',
        'movie_erasmus':      'movies/erasmus.mp4',
        'movie_pacifist_orc': 'movies/pacifist orc.mp4',
        'movie_cousin_dave':  'movies/cousin dave.mp4',
        # New NPC videos
        'movie_dennis_wife':  'movies/dennis wife.mp4',
        'movie_fence':        'movies/the fence.mp4',
        'movie_antique':      'movies/antique.mp4',
        'movie_muck_peasant': 'movies/muck peasants.mp4',
        'movie_retired_soldier': 'movies/retired soldier.mp4',
        'movie_rosencrantz_guildenstern': 'movies/rosencratz and guildensturn.mp4',
        'movie_dennis':       'movies/dennis.mp4',
        'movie_chaplain':     'movies/chaplain.mp4',
        'movie_blacksmith':   'movies/the forge in blacksmith.mp4',
        'movie_lefty':        'movies/lefty.mp4',
        'movie_town_guard':   'movies/town guard.mp4',
        'movie_mended_drum_barman': 'movies/the mended drum - librarian and bearded dwarf and barkeep and commander Grimes.mp4',
        'movie_cohen':        'movies/the mended drum - librarian and bearded dwarf and barkeep and commander Grimes.mp4',
        'movie_librarian':    'movies/the mended drum - librarian and bearded dwarf and barkeep and commander Grimes.mp4',
        'movie_vimes':        'movies/the mended drum - librarian and bearded dwarf and barkeep and commander Grimes.mp4',
        'movie_bearded_dwarf': 'movies/the mended drum - librarian and bearded dwarf and barkeep and commander Grimes.mp4',
        # Class selection videos (E14)
        'movie_fighter':      'classes/portrait-fighter.mp4',
        'movie_rogue':        'classes/portrait-rogue.mp4',
        'movie_spellcaster':  'classes/portrait-wizard.mp4',
    }
    
    # Class selection backdrop image (E14)
    # Prefer 1024x1024 PNG for best quality
    backdrop_file = 'classes/classes_backdrop_small.png'
    if not os.path.exists(backdrop_file):
        backdrop_file = 'classes/classes_backdrop.png'
    if not os.path.exists(backdrop_file):
        backdrop_file = 'classes/classes_backdrop_sm.jpg'
    if os.path.exists(backdrop_file):
        mime = 'image/jpeg' if backdrop_file.endswith('.jpg') else 'image/png'
        size = embed_binary_file(assets, 'sprites', 'classes_backdrop', backdrop_file, mime)
        print(f"  ✓ classes_backdrop -> {backdrop_file} ({size // 1024} KB)")
    if 'movies' not in assets:
        assets['movies'] = {}
    print("\nEmbedding NPC dialog movies...")
    for asset_key, filepath in movie_files.items():
        if os.path.exists(filepath):
            size = embed_binary_file(assets, 'movies', asset_key, filepath, 'video/mp4')
            print(f"  ✓ {asset_key:24} -> {filepath} ({size // 1024} KB)")
        else:
            print(f"  ⚠  {asset_key:24} -> {filepath} NOT FOUND")

    # Split bundles to keep browser JSON.parse memory usage sane.
    warrior_keys = {'warrior_walk', 'warrior_run', 'warrior_sleep', 'warrior_fight'}
    ambient_keys = {'ambient_dungeon', 'ambient_desert', 'ambient_beach', 'ambient_forest'}
    arcade_keys = set(assets['minigames'].keys())
    movie_keys = set(assets.get('movies', {}).keys())

    core_assets = {
        'sprites': {k: v for k, v in assets['sprites'].items() if k not in warrior_keys},
        'sounds': {k: v for k, v in assets['sounds'].items() if k not in ambient_keys},
        'midi': assets['midi'],
        'minigames': {}
    }
    ambient_movies_assets = {
        'sprites': {},
        'sounds': {k: v for k, v in assets['sounds'].items() if k in ambient_keys},
        'midi': {},
        'minigames': {},
        'movies': assets.get('movies', {})
    }
    arcade_assets = {
        'sprites': {},
        'sounds': {},
        'midi': {},
        'minigames': {k: v for k, v in assets['minigames'].items() if k in arcade_keys}
    }
    def _write_bundle(path, blob):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(blob, f, separators=(',', ':'))
        return os.path.getsize(path)

    core_size    = _write_bundle('roguelike_assets.dat', core_assets)
    ambient_movies_size = _write_bundle('roguelike_assets_ambient_movies.dat', ambient_movies_assets)
    arcade_size  = _write_bundle('roguelike_assets_arcade.dat', arcade_assets)

    print(f"\n✅ Asset bundles created:")
    print(f"   roguelike_assets.dat          ({core_size:>12,} bytes)  Sprites:{len(core_assets['sprites'])}  Sounds:{len(core_assets['sounds'])}")
    print(f"   roguelike_assets_ambient_movies.dat  ({ambient_movies_size:>12,} bytes)  Ambient:{len(ambient_movies_assets['sounds'])}  Movies:{len(ambient_movies_assets['movies'])}")
    print(f"   roguelike_assets_arcade.dat   ({arcade_size:>12,} bytes)  Arcade files:{len(arcade_assets['minigames'])}")

    return core_assets, ambient_movies_assets, arcade_assets

def verify_assets():
    """Verify the created bundle files."""
    print("\n" + "=" * 60)
    print("Verification:")
    bundles = [
        ('roguelike_assets.dat', 'core'),
        ('roguelike_assets_ambient_movies.dat', 'ambient+movies'),
        ('roguelike_assets_arcade.dat', 'arcade'),
    ]
    for filename, label in bundles:
        if not os.path.exists(filename):
            print(f"  ✗ Missing bundle: {filename}")
            continue
        with open(filename, 'r', encoding='utf-8') as f:
            assets = json.load(f)
        print(f"  ✓ {label}: sprites={len(assets.get('sprites', {}))} sounds={len(assets.get('sounds', {}))} minigames={len(assets.get('minigames', {}))} movies={len(assets.get('movies', {}))}")

    with open('roguelike_assets.dat', 'r', encoding='utf-8') as f:
        core = json.load(f)
    for sprite in ['player', 'slime', 'wall', 'floor', 'npc_apu', 'npc_wizard', 'npc_chaplain']:
        if sprite in core['sprites']:
            print(f"  ✓ Core sprite '{sprite}' present")
    for sound in ['step', 'sword', 'oof']:
        if sound in core['sounds']:
            print(f"  ✓ Core sound '{sound}' present")
    with open('roguelike_assets_arcade.dat', 'r', encoding='utf-8') as f:
        arcade = json.load(f)
    for mg in ['astrochicken/index.html', 'astrochicken/wasm_exec.js', 'astrochicken/msastrochicken.wasm', 'centipede/index.html']:
        if mg in arcade['minigames']:
            print(f"  ✓ Arcade file '{mg}' present")
    
    print("=" * 60)

def main():
    print("=" * 60)
    print("Complete Asset Builder")
    print("=" * 60)
    
    build_assets()
    verify_assets()
    
    print("\n🎮 Asset file is ready for use!")
    print("\nTo use with asset viewer / game:")
    print("  1. Load roguelike_assets.dat for core sprites/sounds/GIFs")
    print("  2. Optionally load roguelike_assets_ambient_movies.dat for ambience + NPC videos")
    print("  3. Optionally load roguelike_assets_arcade.dat for Astrochicken/Centipede")
    print("=" * 60)

if __name__ == '__main__':
    main()
