import { useState, useEffect, useRef } from "react";
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
  // Don't re-search right after we fill the field from a picked suggestion.
  const skipSearchRef = useRef(false);

  // Search as the user types, same behaviour as the add-place form.
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        setSuggestions(await searchAddress(trimmed));
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const check = async (suggestion: GeocodeResult) => {
    skipSearchRef.current = true;
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
          autoComplete="off"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </span>

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
            // Three states: fits, slightly over (within +20%), clearly over.
            const closeEnough = Math.round(r.limitMinutes * 1.2);
            const state =
              r.minutes <= r.limitMinutes
                ? {
                    icon: "✓",
                    cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
                    hint: "Укладываетесь",
                  }
                : r.minutes <= closeEnough
                  ? {
                      icon: "≈",
                      cls: "bg-amber-100 text-amber-800 border-amber-300",
                      hint: "Чуть дольше лимита",
                    }
                  : {
                      icon: "✕",
                      cls: "bg-red-100 text-red-800 border-red-300",
                      hint: "Заметно дольше лимита",
                    };

            return (
              <div key={r.pointId} className="text-sm flex items-center justify-between gap-2">
                <span className="text-slate-700 truncate">
                  {info.emoji} {info.name} {t?.emoji}
                </span>
                <span
                  className={`${state.cls} border rounded-full px-2 py-0.5 font-semibold whitespace-nowrap`}
                  title={state.hint}
                >
                  {state.icon} {r.minutes} мин
                  <span className="font-normal opacity-70"> / {r.limitMinutes}</span>
                </span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t text-[11px]">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full px-1.5">
              ✓ успеваете
            </span>
            <span className="bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-1.5">
              ≈ чуть дольше
            </span>
            <span className="bg-red-100 text-red-800 border border-red-300 rounded-full px-1.5">
              ✕ не подходит
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
