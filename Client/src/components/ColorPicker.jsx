import React, { useState, useRef, useEffect } from 'react';
import styles from './ColorPicker.module.css';

// Preset colors matching the app theme
const PRESET_COLORS = [
  '#00d4ff', // Primary cyan
  '#667eea', // Purple
  '#764ba2', // Deep purple
  '#10b981', // Success green
  '#ef4444', // Error red
  '#f59e0b', // Warning orange
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Teal
  '#84cc16', // Lime
  '#f97316', // Orange
  '#6366f1', // Indigo
];

const ColorPicker = ({ value, onChange, label = 'Color' }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [hue, setHue] = useState(180);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const pickerRef = useRef(null);
  const wheelRef = useRef(null);

  // Parse initial color value
  useEffect(() => {
    if (value) {
      const hsl = hexToHsl(value);
      if (hsl) {
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
    }
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hexToHsl = (hex) => {
    if (!hex) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0;
      }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hslToHex = (h, s, l) => {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    r = Math.round((r + m) * 255).toString(16).padStart(2, '0');
    g = Math.round((g + m) * 255).toString(16).padStart(2, '0');
    b = Math.round((b + m) * 255).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
  };

  const handleWheelClick = (e) => {
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const radius = rect.width / 2;
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;
    
    // Get click position relative to center
    const x = e.clientX - centerX;
    const y = e.clientY - centerY;
    
    // Calculate angle (hue) - 0 degrees at top, clockwise
    let angle = Math.atan2(x, -y) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    // Calculate distance from center as saturation (0-100%)
    const distance = Math.sqrt(x * x + y * y);
    const newSaturation = Math.min(Math.round((distance / radius) * 100), 100);
    
    setHue(Math.round(angle));
    setSaturation(newSaturation);
    
    const newColor = hslToHex(Math.round(angle), newSaturation, lightness);
    onChange(newColor);
  };

  const handleLightnessChange = (e) => {
    const newLightness = parseInt(e.target.value);
    setLightness(newLightness);
    const newColor = hslToHex(hue, saturation, newLightness);
    onChange(newColor);
  };

  const handlePresetClick = (color) => {
    onChange(color);
    const hsl = hexToHsl(color);
    if (hsl) {
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    }
  };

  const handleClear = () => {
    onChange(null);
    setShowPicker(false);
  };

  const currentColor = value || hslToHex(hue, saturation, lightness);

  return (
    <div className={styles.colorPickerContainer} ref={pickerRef}>
      <label className={styles.label}>{label}</label>
      <div className={styles.colorDisplay} onClick={() => setShowPicker(!showPicker)}>
        <div 
          className={styles.colorSwatch} 
          style={{ backgroundColor: currentColor || 'transparent' }}
        >
          {!currentColor && <span className={styles.noColor}>None</span>}
        </div>
        <span className={styles.colorValue}>{currentColor || 'No color'}</span>
      </div>

      {showPicker && (
        <div className={styles.pickerPopup}>
          {/* Color Wheel */}
          <div 
            className={styles.colorWheel} 
            ref={wheelRef}
            onClick={handleWheelClick}
          >
            <div 
              className={styles.wheelIndicator}
              style={{
                transform: `rotate(${hue}deg) translateY(${-saturation * 0.95}px)`,
              }}
            />
          </div>

          {/* Lightness Slider */}
          <div className={styles.sliderContainer}>
            <label className={styles.sliderLabel}>Lightness</label>
            <input
              type="range"
              min="10"
              max="90"
              value={lightness}
              onChange={handleLightnessChange}
              className={styles.lightnessSlider}
              style={{
                background: `linear-gradient(to right, 
                  ${hslToHex(hue, saturation, 10)}, 
                  ${hslToHex(hue, saturation, 50)}, 
                  ${hslToHex(hue, saturation, 90)})`
              }}
            />
          </div>

          {/* Preset Colors */}
          <div className={styles.presetColors}>
            <label className={styles.presetLabel}>Presets</label>
            <div className={styles.presetGrid}>
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  className={`${styles.presetSwatch} ${value === color ? styles.selected : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handlePresetClick(color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Clear Button */}
          <button className={styles.clearButton} onClick={handleClear}>
            Clear Color
          </button>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
