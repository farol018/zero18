import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PeriodOption } from "@/hooks/useFarolDynamic";

interface FarolPeriodSelectorProps {
  option: PeriodOption;
  customStart?: Date;
  customEnd?: Date;
  onOptionChange: (option: PeriodOption) => void;
  onCustomStartChange: (date: Date) => void;
  onCustomEndChange: (date: Date) => void;
  periodLabel: string;
}

const presets: { value: PeriodOption; label: string }[] = [
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

export function FarolPeriodSelector({
  option,
  customStart,
  customEnd,
  onOptionChange,
  onCustomStartChange,
  onCustomEndChange,
  periodLabel,
}: FarolPeriodSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex gap-1">
        {presets.map((p) => (
          <Button
            key={p.value}
            variant={option === p.value ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => onOptionChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {option === "custom" && (
        <div className="flex items-center gap-2">
          <DatePickerButton
            date={customStart}
            onChange={onCustomStartChange}
            placeholder="Início"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerButton
            date={customEnd}
            onChange={onCustomEndChange}
            placeholder="Fim"
          />
        </div>
      )}

      <span className="text-xs text-muted-foreground italic ml-auto">
        {periodLabel}
      </span>
    </div>
  );
}

function DatePickerButton({
  date,
  onChange,
  placeholder,
}: {
  date?: Date;
  onChange: (d: Date) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs px-2.5 gap-1.5 font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          {date ? format(date, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(d);
              setOpen(false);
            }
          }}
          locale={ptBR}
          disabled={(d) => d > new Date()}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
