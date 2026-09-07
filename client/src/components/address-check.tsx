import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import { searchAddress, type GeocodeResult } from "@/lib/map-utils";
import { getPointType, TRANSPORT_LABELS } from "@/lib/point-types";

interface CheckResult {
  pointId: number;
  type: string;
  transport: string;
  limitMinutes: number;
  minutes: number | null;
  withinLimit: boolean | null;
}

interface AddressCheckProps {
  onPointSelected: (lat: number, lng: number) => void;
}

// Lets the user paste a candidate flat address and see the real door-to-door
// travel time to each of their places (2GIS routing), rather than relying on
// the approximate zone alone.
export function AddressCheck({ onPointSelected }: AddressCheckProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checked, setChecked] = useState<{ name: string; results: CheckResult[] } | null>(null);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
    setIsSearching(true);
    try {
      setSuggestions(await searchAddress(trimmed));
    } finally {
      setIsSearching(false);
    }
  };

  const check = async (suggestion: GeocodeResult) => {
    setSuggestions([]);
    setQuery(suggestion.displayName);
    onPointSelected(suggestion.latitude, suggestion.longitude);
    setIsChecking(true);
    setChecked(null);
    try {
      const response = await apiRequest("POST", "/api/check-address", {
        userId: getUserId(),
        lat: suggestion.latitude,
        lng: suggestion.longitude,
      });
      const data = (await response.json()) as { results: CheckResult[] };
      setChecked({ name: suggestion.displayName, results: data.results });
    } catch {
      setChecked(null);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Проверить адрес
      </div>
      <p className="text-xs text-slate-500">
        Нашли квартиру? Введите её адрес — покажем реальное время до ваших мест.
      </p>

      <div className="relative">
        <Input
          placeholder="Например: Славянский бульвар"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Найти адрес"
        >
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </button>

        {suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {suggestions.map((s, i) => (
              <li key={`${s.latitude},${s.longitude},${i}`}>
                <button
                  type="button"
                  onClick={() => check(s)}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  {s.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isChecking && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Считаем маршруты…
        </div>
      )}

      {checked && (
        <div className="rounded-lg border border-slate-200 p-3 space-y-1">
          {checked.results.map((r) => {
            const info = getPointType(r.type);
            const t = TRANSPORT_LABELS[r.transport];
            if (r.minutes === null) {
              return (
                <div key={r.pointId} className="text-sm text-slate-500">
                  {info.emoji} {info.name} — не удалось посчитать
                </div>
              );
            }
            return (
              <div key={r.pointId} className="text-sm flex items-center justify-between gap-2">
                <span className="text-slate-700 truncate">
                  {info.emoji} {info.name} {t?.emoji}
                </span>
                <span className={r.withinLimit ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                  {r.withinLimit ? "✓" : "✕"} {r.minutes} мин
                  <span className="text-slate-400 font-normal"> / {r.limitMinutes}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
