"use client";
import { useEffect, useRef, useState } from "react";

export type Option = { id: number; name: string };

// LGAs per state, shared by every LocationFields on the page (a state's list is fetched at most once).
const areaCache = new Map<number, Option[]>();

/**
 * State (first-level division) and, where the market has them, LGA (second-level) selects. Choosing a state loads only
 * that state's LGAs, and the LGA resets, so an LGA from another state can never be submitted from this form. The
 * server validates the pair again (saveListing / search) and the database trigger rejects mismatches.
 *
 * `initialAreas` are the LGAs of the initially selected state, rendered on the server so the form also works before
 * JavaScript loads.
 */
export function LocationFields({
  regions,
  regionLabel,
  areaLabel,
  initialRegionId = null,
  initialAreaId = null,
  initialAreas = [],
  regionName = "regionId",
  areaName = "areaId",
  idPrefix = "loc",
  anyLabel,
  required = false,
  className = "grid gap-4 sm:grid-cols-2",
  labelClassName = "label",
  selectClassName = "input",
  regionError,
  areaError,
}: {
  regions: Option[];
  regionLabel: string;
  /** e.g. "LGA". Null when the market has no second-level data: only the state select is shown. */
  areaLabel: string | null;
  initialRegionId?: number | null;
  initialAreaId?: number | null;
  initialAreas?: Option[];
  regionName?: string;
  areaName?: string;
  idPrefix?: string;
  /** Search forms: label of the empty "any" option (e.g. "All"). Listing forms leave it unset. */
  anyLabel?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  regionError?: React.ReactNode;
  areaError?: React.ReactNode;
}) {
  const [regionId, setRegionId] = useState<number | null>(initialRegionId);
  const [areaId, setAreaId] = useState<number | null>(initialAreaId);
  const [areas, setAreas] = useState<Option[]>(initialAreas);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(regionId);

  useEffect(() => {
    if (initialRegionId && initialAreas.length) areaCache.set(initialRegionId, initialAreas);
  }, [initialRegionId, initialAreas]);

  async function chooseRegion(id: number | null) {
    latest.current = id;
    setRegionId(id);
    setAreaId(null);
    setFailed(false);
    if (!id || !areaLabel) return setAreas([]);
    const cached = areaCache.get(id);
    if (cached) return setAreas(cached);
    setAreas([]);
    setLoading(true);
    let data: Option[] | null = null;
    try {
      const res = await fetch(`/api/locations/areas?region=${id}`);
      if (res.ok) data = await res.json();
    } catch {}
    if (latest.current !== id) return; // a later choice won the race
    setLoading(false);
    if (!data) return setFailed(true);
    areaCache.set(id, data);
    setAreas(data);
  }

  const rid = `${idPrefix}-${regionName}`;
  const aid = `${idPrefix}-${areaName}`;
  const placeholder = anyLabel ?? "Choose…";
  return (
    <div className={className}>
      <div>
        <label className={labelClassName} htmlFor={rid}>{regionLabel}</label>
        <select id={rid} name={regionName} value={regionId ?? ""} required={required} className={selectClassName}
          onChange={(e) => chooseRegion(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{anyLabel ? `${anyLabel} ${regionLabel.toLowerCase()}s` : placeholder}</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {regionError}
      </div>
      {areaLabel && (
        <div>
          <label className={labelClassName} htmlFor={aid}>{areaLabel}</label>
          <select id={aid} name={areaName} value={areaId ?? ""} required={required && areas.length > 0} disabled={!regionId || loading}
            className={selectClassName} aria-busy={loading} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
            data-testid={`${idPrefix}-area`}>
            <option value="">
              {!regionId ? `Choose a ${regionLabel.toLowerCase()} first` : loading ? "Loading…" : anyLabel ? `${anyLabel} ${areaLabel}s` : placeholder}
            </option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {failed && <p className="mt-1 text-xs text-danger" role="alert">Couldn&apos;t load the {areaLabel} list. Check your connection and choose the {regionLabel.toLowerCase()} again.</p>}
          {areaError}
        </div>
      )}
    </div>
  );
}
