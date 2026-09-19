import { useState } from "react";
import { AttractionPointForm, FORM_ID } from "./attraction-point-form";
import { AddressCheck } from "./address-check";
import { PointsList } from "./points-list";
import { Button } from "@/components/ui/button";
import { PlusCircle, HelpCircle } from "lucide-react";
import type { AttractionPoint } from "@shared/schema";

interface ControlPanelProps {
  attractionPoints: AttractionPoint[];
  selectedPoint: {lat: number, lng: number} | null;
  onClearSelectedPoint: () => void;
  onPointSelected: (lat: number, lng: number) => void;
  /** A place was saved — the caller decides whether to get out of the way. */
  onPlaceAdded: () => void;
  onShowMethodology: () => void;
}

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  onClearSelectedPoint,
  onPointSelected,
  onPlaceAdded,
  onShowMethodology,
}: ControlPanelProps) {
  const hasPoints = attractionPoints.length > 0;
  // Once the user has places, the form collapses into a single button.
  const [showForm, setShowForm] = useState(false);
  const [addPending, setAddPending] = useState(false);
  // A pending map selection always opens the form — otherwise the picked
  // address would land in a collapsed form the user can't see.
  const formVisible = !hasPoints || showForm || selectedPoint !== null;

  return (
    <div className="h-full flex flex-col">
      {/* Panel header. Hidden on the phone sheet, where vertical space is
          scarce and the onboarding already set the context. */}
      <div className="hidden lg:block px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">
          Где снять или купить жильё?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Добавьте места, куда ездите регулярно — покажем, где удобно жить.
        </p>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {/* Hint for first-time users, with the single explainer entry point. */}
        {!hasPoints && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700 space-y-2">
            <div>
              Добавьте 2–3 места (работа, зал…) — на карте зелёным покажем районы,
              откуда вы успеваете во все из них.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-white"
              onClick={onShowMethodology}
            >
              <HelpCircle className="w-4 h-4 mr-2 text-blue-600" />
              Как это считается
            </Button>
          </div>
        )}

        {formVisible ? (
          <AttractionPointForm
            selectedPoint={selectedPoint}
            onClearSelectedPoint={onClearSelectedPoint}
            onPointSelected={onPointSelected}
            onAdded={() => {
              setShowForm(false);
              onPlaceAdded();
            }}
            onPendingChange={setAddPending}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowForm(true)}
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Добавить ещё место
          </Button>
        )}

        {/* Points List */}
        {hasPoints && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Ваши места ({attractionPoints.length})
            </div>
            <PointsList points={attractionPoints} />
          </div>
        )}

        {hasPoints && (
          <div className="pt-2 border-t border-slate-100">
            <AddressCheck onPointSelected={onPointSelected} />
          </div>
        )}
      </div>

      {/* Footer: always outside the scroll area, so the primary action can
          never be scrolled out of view. Starting over is in the header, where
          it is reachable without opening the panel. */}
      {formVisible && (
        <div
          className="px-6 pt-3 border-t border-slate-100 bg-white flex-none"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            type="submit"
            form={FORM_ID}
            disabled={addPending}
            className="w-full h-12 text-base rounded-2xl"
          >
            {addPending ? "Добавляем…" : "Добавить место"}
          </Button>
        </div>
      )}
    </div>
  );
}
