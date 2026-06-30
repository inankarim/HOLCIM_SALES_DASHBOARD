import { useEffect, useRef, useState } from "react";
import { salesApi } from "../../api/salesApi";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Filter, RotateCcw, Calendar } from "lucide-react";
import type { FilterParams } from "../../api/salesApi";

interface FilterOptions {
  regions: string[];
  areas: string[];
  territories: string[];
  tsm_tse: string[];
  asm_kam: string[];
  rsm_b2b_head: string[];
  customers: string[];
  product?: string;
}

interface Props {
  filters: FilterParams;
  dates: string[];
  onChange: (f: FilterParams) => void;
}

const DEFAULT_FILTERS: FilterParams = {
  date: "",
  start_date: "",
  end_date: "",
  region: "",
  area: "",
  territory: "",
  tsm_tse: "",
  asm_kam: "",
  rsm: "",
  customer: "",
};

type DateMode = "single" | "range";

function SelectField({
  label,
  value,
  onValueChange,
  options,
  allLabel,
  labelMap,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
  allLabel: string;
  labelMap?: Record<string, string>;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <Select value={value || "all"} onValueChange={(v) => onValueChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {labelMap ? labelMap[o] || o : o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SearchableSelect({
  label,
  value,
  onValueChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase()),
  );

  const display = value || allLabel;

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex h-7 w-full items-center justify-between rounded-md border bg-background px-2 text-xs hover:bg-muted"
        >
          <span className="truncate">{display}</span>
          <span className="ml-1 text-muted-foreground">▾</span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            {/* Search input */}
            <div className="p-1.5 border-b">
              <Input
                autoFocus
                placeholder="Search..."
                className="h-6 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options list */}
            <div className="max-h-40 overflow-y-auto">
              <button
                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-muted ${
                  !value ? "bg-muted font-medium" : ""
                }`}
                onClick={() => {
                  onValueChange("");
                  setSearch("");
                  setOpen(false);
                }}
              >
                {allLabel}
              </button>

              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No results
                </p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o}
                    className={`w-full px-2 py-1.5 text-left text-xs hover:bg-muted ${
                      value === o ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => {
                      onValueChange(o);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    {o}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FilterSidebar({ filters, dates, onChange }: Props) {
  const [options, setOptions] = useState<FilterOptions>({
    regions: [],
    areas: [],
    territories: [],
    tsm_tse: [],
    asm_kam: [],
    rsm_b2b_head: [],
    customers: [],
  });
  const [dateMode, setDateMode] = useState<DateMode>("single");

  useEffect(() => {
    salesApi
      .getFilterOptions({
        region: filters.region,
        area: filters.area,
        territory: filters.territory,
      })
      .then((res) => setOptions(res.data.options))
      .catch(console.error);
  }, [filters.region, filters.area, filters.territory]);

  const set = (k: keyof FilterParams, v: string) => {
    const next = { ...filters, [k]: v };
    if (k === "region") {
      next.area = "";
      next.territory = "";
    }
    if (k === "area") next.territory = "";
    onChange(next);
  };

  const handleReset = () => {
    setDateMode("single");
    onChange(DEFAULT_FILTERS);
  };

  const getMaxEndDate = (start: string) => {
    if (!start) return "";
    const d = new Date(start);
    d.setMonth(d.getMonth() + 4);
    return d.toISOString().slice(0, 10);
  };

  return (
    <Card className="w-52">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Filters
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">

        {/* Date Mode Toggle */}
        <div className="space-y-1">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Date
          </Label>
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`flex-1 text-xs py-1 transition-colors ${
                dateMode === "single"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => {
                setDateMode("single");
                onChange({ ...filters, start_date: "", end_date: "" });
              }}
            >
              Single
            </button>
            <button
              className={`flex-1 text-xs py-1 transition-colors ${
                dateMode === "range"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => {
                setDateMode("range");
                onChange({ ...filters, date: "" });
              }}
            >
              Range
            </button>
          </div>
        </div>

        {/* Single Date */}
        {dateMode === "single" && (
          <SelectField
            label=""
            value={filters.date || ""}
            onValueChange={(v) => set("date", v)}
            options={dates}
            allLabel="Latest Date"
          />
        )}

        {/* Date Range */}
        {dateMode === "range" && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                className="h-7 text-xs"
                value={filters.start_date || ""}
                onChange={(e) => {
                  onChange({
                    ...filters,
                    start_date: e.target.value,
                    end_date: "",
                  });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                className="h-7 text-xs"
                value={filters.end_date || ""}
                min={filters.start_date || ""}
                max={getMaxEndDate(filters.start_date || "")}
                disabled={!filters.start_date}
                onChange={(e) => {
                  onChange({ ...filters, end_date: e.target.value });
                }}
              />
            </div>
            {filters.start_date && (
              <p className="text-xs text-muted-foreground">
                Max range: 4 months
              </p>
            )}
          </div>
        )}

        {/* Product */}
        <SelectField
          label="Product"
          value={filters.product || ""}
          onValueChange={(v) => set("product", v)}
          options={["PLC", "PLC+", "POW", "Holcim SS", "HWP", "HCG"]}
          allLabel="All Products"
          labelMap={{
            "PLC": "Supercrete",
            "PLC+": "Supercrete Plus",
            "POW": "PowerCrete",
            "Holcim SS": "Holcim Strong Structure",
            "HWP": "Holcim Water Protect",
            "HCG": "Holcim Coastal Guard",
          }}
        />

        {/* Region */}
        <SelectField
          label="Region"
          value={filters.region || ""}
          onValueChange={(v) => set("region", v)}
          options={options.regions}
          allLabel="All Regions"
        />

        {/* Area */}
        <SelectField
          label="Area"
          value={filters.area || ""}
          onValueChange={(v) => set("area", v)}
          options={options.areas}
          allLabel="All Areas"
        />

        {/* Territory */}
        <SelectField
          label="Territory"
          value={filters.territory || ""}
          onValueChange={(v) => set("territory", v)}
          options={options.territories}
          allLabel="All Territories"
        />

        {/* TSM/TSE — searchable */}
        {options.tsm_tse.length > 0 && (
          <SearchableSelect
            label="TSM / TSE"
            value={filters.tsm_tse || ""}
            onValueChange={(v) => set("tsm_tse", v)}
            options={options.tsm_tse}
            allLabel="All TSM/TSE"
          />
        )}

        {/* ASM/KAM — searchable */}
        {options.asm_kam.length > 0 && (
          <SearchableSelect
            label="ASM / KAM"
            value={filters.asm_kam || ""}
            onValueChange={(v) => set("asm_kam", v)}
            options={options.asm_kam}
            allLabel="All ASM/KAM"
          />
        )}

        {/* RSM/B2B Head — searchable */}
        {options.rsm_b2b_head.length > 0 && (
          <SearchableSelect
            label="RSM / B2B Head"
            value={filters.rsm || ""}
            onValueChange={(v) => set("rsm", v)}
            options={options.rsm_b2b_head}
            allLabel="All RSM/B2B"
          />
        )}

        {/* Customer Search */}
        <div className="space-y-1">
          <Label className="text-xs font-medium">Search Customer</Label>
          <Input
            placeholder="Customer name..."
            className="h-7 text-xs"
            value={filters.customer || ""}
            onChange={(e) => set("customer", e.target.value)}
          />
        </div>

      </CardContent>
    </Card>
  );
}