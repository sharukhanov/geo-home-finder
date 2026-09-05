// Single source of truth for attraction point types: labels, emoji, and
// smart defaults (typical commute time and arrival hour) so the user usually
// doesn't have to set anything beyond the type and address.

export interface PointTypeInfo {
  value: string;
  name: string;
  emoji: string;
  defaultMinutes: number;
  defaultArrivalHour: number;
}

export const POINT_TYPES: PointTypeInfo[] = [
  { value: "work", name: "Работа", emoji: "🏢", defaultMinutes: 30, defaultArrivalHour: 9 },
  { value: "study", name: "Учёба", emoji: "🎓", defaultMinutes: 40, defaultArrivalHour: 9 },
  { value: "fitness", name: "Фитнес", emoji: "💪", defaultMinutes: 30, defaultArrivalHour: 19 },
  { value: "hobby", name: "Хобби", emoji: "🎨", defaultMinutes: 40, defaultArrivalHour: 18 },
  { value: "family", name: "Семья", emoji: "👨‍👩‍👧‍👦", defaultMinutes: 40, defaultArrivalHour: 18 },
  { value: "shopping", name: "Покупки", emoji: "🛍️", defaultMinutes: 20, defaultArrivalHour: 18 },
  { value: "other", name: "Другое", emoji: "📍", defaultMinutes: 30, defaultArrivalHour: 9 },
];

export function getPointType(value: string): PointTypeInfo {
  return POINT_TYPES.find((t) => t.value === value) ?? POINT_TYPES[POINT_TYPES.length - 1];
}

export const TRANSPORT_LABELS: Record<string, { emoji: string; label: string }> = {
  public_transport: { emoji: "🚇", label: "Общественный транспорт" },
  driving: { emoji: "🚗", label: "Автомобиль" },
  walking: { emoji: "🚶", label: "Пешком" },
};
