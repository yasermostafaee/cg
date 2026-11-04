import type { DynamicField, Element } from '@cg/shared-schema';
import { image, tf } from './gallery-helpers.js';

/** Ordinary authored choices, exposed on the condition text's Dynamic / Data section. */
export const WEATHER_CHOICES = [
  { value: 'آفتابی', label: 'آفتابی', icon: 'clear-day' },
  { value: 'ابری', label: 'ابری', icon: 'cloudy' },
  { value: 'بارانی', label: 'بارانی', icon: 'rain' },
  { value: 'برفی', label: 'برفی', icon: 'snow' },
  { value: 'نیمه‌ابری', label: 'نیمه‌ابری', icon: 'partly-cloudy-day' },
] as const;

export function weatherTypeField(): DynamicField {
  return {
    id: 'weatherType',
    label: 'نوع آب‌وهوا',
    required: true,
    type: 'select',
    default: 'آفتابی',
    options: WEATHER_CHOICES.map(({ value, label }) => ({ value, label })),
  };
}

/** One real image + inspectable image-change rules, never hidden shape switches. */
export function weatherIconElements(
  prefix: string,
  fieldId: string,
  x: number,
  y: number,
  size: number,
  zIndex: number,
): Element[] {
  return [
    {
      ...image(
        prefix,
        'آیکون آب‌وهوا — Value rules',
        'weather-clear-day',
        tf(x, y, size, size),
        zIndex,
        'contain',
      ),
      valueRules: {
        input: { kind: 'field', fieldId },
        rules: WEATHER_CHOICES.map(({ value, icon }) => ({
          condition: { comparator: '=' as const, value },
          effect: {
            elementId: prefix,
            property: 'image' as const,
            value: { assetId: `weather-${icon}`, source: 'project' as const },
          },
        })),
      },
    },
  ];
}
