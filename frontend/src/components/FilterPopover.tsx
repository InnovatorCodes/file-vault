import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export interface FilterOptions {
  min_size: string;
  max_size: string;
  mime_type: string;
  start_date: string;
  end_date: string;
}

interface FilterPopoverProps {
  onSave: (filters: FilterOptions) => void;
  onClose: () => void;
  initialFilters: FilterOptions;
}

interface LocalFilterState extends Omit<FilterOptions, 'min_size' | 'max_size'> {
  minSizeValue: string;
  minSizeUnit: keyof typeof sizeUnits;
  maxSizeValue: string;
  maxSizeUnit: keyof typeof sizeUnits;
}

const sizeUnits = {
  Bytes: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
};

const mimeTypes = [
  "All",
  "image/jpeg",
  "image/png",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const FilterPopover: React.FC<FilterPopoverProps> = ({
  onSave,
  onClose,
  initialFilters,
}) => {
  const getInitialState = (): LocalFilterState => ({
    mime_type: initialFilters.mime_type,
    start_date: initialFilters.start_date,
    end_date: initialFilters.end_date,
    minSizeValue: '',
    minSizeUnit: 'KB',
    maxSizeValue: '',
    maxSizeUnit: 'KB',
  });

  const [localFilters, setLocalFilters] = useState<LocalFilterState>(getInitialState());

  useEffect(() => {
    const parseSize = (sizeInBytes: string) => {
      if (!sizeInBytes || Number(sizeInBytes) === 0) return { value: '', unit: 'KB' as keyof typeof sizeUnits };
      const bytes = Number(sizeInBytes);
      const units: (keyof typeof sizeUnits)[] = ['GB', 'MB', 'KB'];
      for (const unit of units) {
        const limit = sizeUnits[unit];
        if (bytes >= limit) {
          return { value: (bytes / limit).toFixed(2).replace(/\.00$/, ''), unit };
        }
      }
      return { value: String(bytes), unit: 'Bytes' as keyof typeof sizeUnits };
    };

    const min = parseSize(initialFilters.min_size);
    const max = parseSize(initialFilters.max_size);

    setLocalFilters(prev => ({
      ...prev,
      minSizeValue: min.value,
      minSizeUnit: min.unit,
      maxSizeValue: max.value,
      maxSizeUnit: max.unit,
    }));
  }, [initialFilters]);


  const handleSave = () => {
    const minBytes = localFilters.minSizeValue ? String(Math.round(Number(localFilters.minSizeValue) * sizeUnits[localFilters.minSizeUnit])) : "";
    const maxBytes = localFilters.maxSizeValue ? String(Math.round(Number(localFilters.maxSizeValue) * sizeUnits[localFilters.maxSizeUnit])) : "";
    onSave({
      mime_type: localFilters.mime_type,
      start_date: localFilters.start_date,
      end_date: localFilters.end_date,
      min_size: minBytes,
      max_size: maxBytes,
    });
  };

  const handleReset = () => {
    const defaultState: FilterOptions = {
      mime_type: "",
      start_date: "",
      end_date: "",
      min_size: "",
      max_size: "",
    };
    onSave(defaultState);
    setLocalFilters({
      mime_type: "",
      start_date: "",
      end_date: "",
      minSizeValue: '',
      minSizeUnit: 'KB',
      maxSizeValue: '',
      maxSizeUnit: 'KB',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setLocalFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleMimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalFilters((prev) => ({
      ...prev,
      mime_type: e.target.value === "All" ? "" : e.target.value,
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-14 right-0 mt-2 w-80 bg-zinc-800/80 backdrop-blur-md border border-zinc-700/50 rounded-md shadow-lg z-50 p-4"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">Filter Options</h3>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-700">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm text-zinc-400 block mb-1">File Size</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="Min"
              name="minSizeValue"
              value={localFilters.minSizeValue}
              onChange={handleChange}
              className="w-full bg-zinc-700 border border-zinc-600 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <select
              name="minSizeUnit"
              value={localFilters.minSizeUnit}
              onChange={handleChange}
              className="bg-zinc-700 border border-zinc-600 text-sm rounded-md px-2 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {Object.keys(sizeUnits).map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center mt-2">
            <input
              type="number"
              placeholder="Max"
              name="maxSizeValue"
              value={localFilters.maxSizeValue}
              onChange={handleChange}
              className="w-full bg-zinc-700 border border-zinc-600 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <select
              name="maxSizeUnit"
              value={localFilters.maxSizeUnit}
              onChange={handleChange}
              className="bg-zinc-700 border border-zinc-600 text-sm rounded-md px-2 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {Object.keys(sizeUnits).map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="mime_type" className="text-sm text-zinc-400 block mb-1">MIME Type</label>
          <select
            id="mime_type"
            name="mime_type"
            value={localFilters.mime_type || "All"}
            onChange={handleMimeChange}
            className="w-full bg-zinc-700 border border-zinc-600 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {mimeTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="start_date" className="text-sm text-zinc-400 block mb-1">Start Date</label>
          <input
            type="date"
            id="start_date"
            name="start_date"
            value={localFilters.start_date}
            onChange={handleChange}
            className="w-full bg-zinc-700 border border-zinc-600 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="end_date" className="text-sm text-zinc-400 block mb-1">End Date</label>
          <input
            type="date"
            id="end_date"
            name="end_date"
            value={localFilters.end_date}
            onChange={handleChange}
            className="w-full bg-zinc-700 border border-zinc-600 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-zinc-600 hover:bg-zinc-700 rounded-md text-sm font-semibold transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-md text-sm font-semibold transition-colors"
        >
          Save Filters
        </button>
      </div>
    </motion.div>
  );
};

export default FilterPopover;
