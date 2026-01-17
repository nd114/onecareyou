import { useState, useEffect, useCallback } from 'react';
import { 
  UnitPreferences, 
  DEFAULT_UNIT_PREFERENCES, 
  GlucoseUnit, 
  WeightUnit, 
  TemperatureUnit,
  convertGlucose,
  convertWeight,
  convertTemperature,
  VitalType,
  VITAL_CONFIG
} from '@/types/health';

const STORAGE_KEY = 'onecare_unit_preferences';

export function useUnitPreferences() {
  const [preferences, setPreferences] = useState<UnitPreferences>(DEFAULT_UNIT_PREFERENCES);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPreferences({ ...DEFAULT_UNIT_PREFERENCES, ...JSON.parse(stored) });
      } catch (e) {
        console.error('Failed to parse unit preferences:', e);
      }
    }
  }, []);

  const updatePreference = useCallback(<K extends keyof UnitPreferences>(
    key: K, 
    value: UnitPreferences[K]
  ) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Convert a vital value to the user's preferred unit
  const convertVitalValue = useCallback((
    type: VitalType, 
    value: number, 
    fromUnit?: string
  ): { value: number; unit: string } => {
    const config = VITAL_CONFIG[type];
    const baseUnit = fromUnit || config.unit;

    switch (type) {
      case 'glucose': {
        const targetUnit = preferences.glucose;
        const converted = convertGlucose(value, baseUnit as GlucoseUnit, targetUnit);
        return { value: converted, unit: targetUnit };
      }
      case 'weight': {
        const targetUnit = preferences.weight;
        const converted = convertWeight(value, baseUnit as WeightUnit, targetUnit);
        return { value: converted, unit: targetUnit };
      }
      case 'temperature': {
        const targetUnit = preferences.temperature;
        const converted = convertTemperature(value, baseUnit as TemperatureUnit, targetUnit);
        return { value: converted, unit: targetUnit };
      }
      default:
        return { value, unit: config.unit };
    }
  }, [preferences]);

  // Get the display unit for a vital type
  const getDisplayUnit = useCallback((type: VitalType): string => {
    switch (type) {
      case 'glucose':
        return preferences.glucose;
      case 'weight':
        return preferences.weight;
      case 'temperature':
        return preferences.temperature;
      default:
        return VITAL_CONFIG[type].unit;
    }
  }, [preferences]);

  // Get normal range in user's preferred unit
  const getNormalRange = useCallback((type: VitalType): { min: number; max: number; unit: string } => {
    const config = VITAL_CONFIG[type];
    const baseMin = config.normalMin;
    const baseMax = config.normalMax;

    switch (type) {
      case 'glucose': {
        const unit = preferences.glucose;
        return {
          min: convertGlucose(baseMin, 'mg/dL', unit),
          max: convertGlucose(baseMax, 'mg/dL', unit),
          unit
        };
      }
      case 'weight': {
        const unit = preferences.weight;
        return {
          min: convertWeight(baseMin, 'kg', unit),
          max: convertWeight(baseMax, 'kg', unit),
          unit
        };
      }
      case 'temperature': {
        const unit = preferences.temperature;
        return {
          min: convertTemperature(baseMin, '°C', unit),
          max: convertTemperature(baseMax, '°C', unit),
          unit
        };
      }
      default:
        return { min: baseMin, max: baseMax, unit: config.unit };
    }
  }, [preferences]);

  return {
    preferences,
    updatePreference,
    convertVitalValue,
    getDisplayUnit,
    getNormalRange
  };
}
