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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'marpe_unit_preferences';

export function useUnitPreferences() {
  const { user, profile } = useAuth();
  const [preferences, setPreferences] = useState<UnitPreferences>(DEFAULT_UNIT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from database first, then fallback to localStorage
  useEffect(() => {
    const loadPreferences = async () => {
      // Try to load from profile first (database)
      if (profile && (profile as any).unit_preferences) {
        const dbPrefs = (profile as any).unit_preferences as UnitPreferences;
        setPreferences({ ...DEFAULT_UNIT_PREFERENCES, ...dbPrefs });
        // Also sync to localStorage for offline access
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbPrefs));
        setIsLoaded(true);
        return;
      }

      // Fallback to localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setPreferences({ ...DEFAULT_UNIT_PREFERENCES, ...JSON.parse(stored) });
        } catch (e) {
          console.error('Failed to parse unit preferences:', e);
        }
      }
      setIsLoaded(true);
    };

    loadPreferences();
  }, [profile]);

  const updatePreference = useCallback(async <K extends keyof UnitPreferences>(
    key: K, 
    value: UnitPreferences[K]
  ) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    
    // Save to localStorage immediately for instant feedback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Also save to database if user is logged in
    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ unit_preferences: updated })
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Failed to save unit preferences to database:', error);
        }
      } catch (e) {
        console.error('Failed to save unit preferences:', e);
      }
    }
  }, [preferences, user]);

  // Convert a vital value to the user's preferred unit (for display)
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

  // Convert a vital value FROM user's preferred unit TO base unit (for saving)
  const convertToBaseUnit = useCallback((
    type: VitalType, 
    value: number
  ): number => {
    const config = VITAL_CONFIG[type];

    switch (type) {
      case 'glucose': {
        const fromUnit = preferences.glucose;
        return convertGlucose(value, fromUnit, 'mg/dL' as GlucoseUnit);
      }
      case 'weight': {
        const fromUnit = preferences.weight;
        return convertWeight(value, fromUnit, 'kg' as WeightUnit);
      }
      case 'temperature': {
        const fromUnit = preferences.temperature;
        return convertTemperature(value, fromUnit, '°C' as TemperatureUnit);
      }
      default:
        return value;
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
    convertToBaseUnit,
    getDisplayUnit,
    getNormalRange,
    isLoaded
  };
}
