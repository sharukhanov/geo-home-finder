import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertAttractionPointSchema } from "@shared/schema";
import {
  searchAddress,
  geocodeAddress,
  reverseGeocode,
  type GeocodeResult,
} from "@/lib/map-utils";
import { getUserId } from "@/lib/user-id";
import { POINT_TYPES, getPointType } from "@/lib/point-types";

const formSchema = insertAttractionPointSchema.extend({
  type: z.enum(["work", "study", "fitness", "hobby", "family", "shopping", "other"]),
  travelTimeMinutes: z.number().min(10).max(60),
  arrivalHour: z.number().min(0).max(23),
});

type FormData = z.infer<typeof formSchema>;

interface AttractionPointFormProps {
  selectedPoint: {lat: number, lng: number} | null;
  onClearSelectedPoint: () => void;
}

const arrivalHourOptions = [
  { value: 8, label: "08:00 — раннее утро" },
  { value: 9, label: "09:00 — утро (на работу)" },
  { value: 10, label: "10:00 — позднее утро" },
  { value: 13, label: "13:00 — день" },
  { value: 18, label: "18:00 — вечер (после работы)" },
  { value: 19, label: "19:00 — вечер" },
  { value: 21, label: "21:00 — поздний вечер" },
];

const DEFAULT_TYPE = "work";

export function AttractionPointForm({ selectedPoint, onClearSelectedPoint }: AttractionPointFormProps) {
  const [travelTime, setTravelTime] = useState([getPointType(DEFAULT_TYPE).defaultMinutes]);
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // True once coordinates have been resolved (via suggestion or map click).
  const [hasCoords, setHasCoords] = useState(false);
  // Skip the debounced search when we set the address programmatically.
  const skipSearchRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: getUserId(),
      type: DEFAULT_TYPE,
      name: "",
      address: "",
      latitude: 55.7558,
      longitude: 37.6176,
      travelTimeMinutes: getPointType(DEFAULT_TYPE).defaultMinutes,
      arrivalHour: getPointType(DEFAULT_TYPE).defaultArrivalHour,
    },
  });

  const arrivalHour = form.watch("arrivalHour");

  const createPointMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/attraction-points", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      form.reset();
      setAddress("");
      setSuggestions([]);
      setShowSuggestions(false);
      setHasCoords(false);
      setShowAdvanced(false);
      setTravelTime([getPointType(DEFAULT_TYPE).defaultMinutes]);
      onClearSelectedPoint();
      toast({
        title: "Точка добавлена",
        description: "Место добавлено на карту",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось добавить точку притяжения",
        variant: "destructive",
      });
    },
  });

  // Reverse-geocode the coordinates when a point is picked on the map.
  useEffect(() => {
    if (!selectedPoint) return;

    form.setValue("latitude", selectedPoint.lat);
    form.setValue("longitude", selectedPoint.lng);
    setHasCoords(true);

    const fallback = `${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)}`;
    skipSearchRef.current = true;
    setAddress(fallback);
    form.setValue("address", fallback);
    setShowSuggestions(false);

    reverseGeocode({ lat: selectedPoint.lat, lng: selectedPoint.lng }).then((readable) => {
      skipSearchRef.current = true;
      setAddress(readable);
      form.setValue("address", readable);
    });
  }, [selectedPoint]);

  // Debounced address autocomplete.
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const query = address.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddress(query);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [address]);

  // Update form when the travel-time slider changes.
  useEffect(() => {
    form.setValue("travelTimeMinutes", travelTime[0]);
  }, [travelTime]);

  // When the type changes, apply that type's smart defaults for time and hour.
  const handleTypeChange = (value: string) => {
    form.setValue("type", value as FormData["type"]);
    const info = getPointType(value);
    setTravelTime([info.defaultMinutes]);
    form.setValue("arrivalHour", info.defaultArrivalHour);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    form.setValue("address", value);
    setHasCoords(false); // typing invalidates previously resolved coordinates
  };

  const selectSuggestion = (suggestion: GeocodeResult) => {
    skipSearchRef.current = true;
    setAddress(suggestion.displayName);
    form.setValue("address", suggestion.displayName);
    form.setValue("latitude", suggestion.latitude);
    form.setValue("longitude", suggestion.longitude);
    setHasCoords(true);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const onSubmit = async (data: FormData) => {
    if (!data.address.trim()) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, введите адрес или выберите место на карте",
        variant: "destructive",
      });
      return;
    }

    // If the user typed an address but never picked a suggestion, resolve it now.
    if (!hasCoords) {
      const coords = await geocodeAddress(data.address);
      if (!coords) {
        toast({
          title: "Адрес не найден",
          description: "Не удалось определить координаты. Уточните адрес или выберите точку на карте.",
          variant: "destructive",
        });
        return;
      }
      data.latitude = coords.lat;
      data.longitude = coords.lng;
    }

    // Name is derived from the type.
    if (!data.name.trim()) {
      const info = getPointType(data.type);
      data.name = `${info.emoji} ${info.name}`;
    }

    createPointMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Что это за место</FormLabel>
              <Select onValueChange={handleTypeChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип места" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {POINT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.emoji} {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Адрес</FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                placeholder="Введите адрес или кликните на карте"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
            </FormControl>
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.latitude},${suggestion.longitude},${index}`}>
                    <button
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                      className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {suggestion.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {hasCoords && (
            <p className="text-xs text-emerald-600">✓ Координаты определены</p>
          )}
        </FormItem>

        {/* Smart defaults are applied from the type; fine-tuning is optional. */}
        <div className="rounded-md bg-slate-50 p-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center justify-between w-full text-sm text-slate-700"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              Время в пути: до {travelTime[0]} мин · к {String(arrivalHour).padStart(2, "0")}:00
            </span>
            <span className="text-xs text-blue-600">{showAdvanced ? "скрыть" : "изменить"}</span>
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Максимальное время в пути: {travelTime[0]} мин</Label>
                <Slider
                  value={travelTime}
                  onValueChange={setTravelTime}
                  max={60}
                  min={10}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>10 мин</span>
                  <span>60 мин</span>
                </div>
              </div>

              <FormField
                control={form.control}
                name="arrivalHour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Во сколько нужно быть на месте</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {arrivalHourOptions.map((option) => (
                          <SelectItem key={option.value} value={String(option.value)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">
                      Учитываем типичные пробки на это время (в будни)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={createPointMutation.isPending}
        >
          {createPointMutation.isPending ? "Добавляем..." : "Добавить место"}
        </Button>
      </form>
    </Form>
  );
}
