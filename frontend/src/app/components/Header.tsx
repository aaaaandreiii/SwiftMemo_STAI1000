import { useState } from "react";
import { Search, Settings, ChevronDown, Check } from "lucide-react";
import { motion } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { TENANTS, type Tenant } from "../data";

interface HeaderProps {
  tenant: Tenant;
  onTenantChange: (t: Tenant) => void;
  query: string;
  onQueryChange: (q: string) => void;
  online: boolean;
}

export function Header({ tenant, onTenantChange, query, onQueryChange, online }: HeaderProps) {
  const [focused, setFocused] = useState(false);

  return (
    <header className="glass sticky top-0 z-30 flex h-16 items-center gap-4 rounded-none border-x-0 border-t-0 px-4 md:px-6">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10b981] shadow-[0_0_12px_#10b981]" />
        </span>
        <span
          className="text-[1.35rem] tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Swift<span className="text-[#10b981]">Memo</span>
        </span>
      </div>

      {/* Search */}
      <div className="relative mx-auto hidden max-w-xl flex-1 md:block">
        <Search
          className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${
            focused ? "text-[#10b981]" : "text-muted-foreground"
          }`}
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search all announcements…"
          className="h-10 w-full rounded-xl border border-border bg-input/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-[#10b981]/50 focus:ring-2 focus:ring-[#10b981]/20"
        />
      </div>

      {/* WS status */}
      <div className="hidden items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1.5 lg:flex">
        <motion.span
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`h-2 w-2 rounded-full ${online ? "bg-[#10b981]" : "bg-[#f43f5e]"}`}
          style={{ boxShadow: online ? "0 0 8px #10b981" : "0 0 8px #f43f5e" }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {online ? "Live" : "Offline"}
        </span>
      </div>

      {/* Tenant selector */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2.5 outline-none transition-colors hover:border-[#10b981]/40">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#006432] to-[#10b981] text-xs font-semibold text-white">
            {tenant.initials}
          </span>
          <span className="hidden text-sm sm:block">{tenant.name.split(" ")[0]}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 glass">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Active tenant
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {TENANTS.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => onTenantChange(t)}
              className="flex items-center gap-2.5 py-2"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#006432] to-[#10b981] text-xs font-semibold text-white">
                {t.initials}
              </span>
              <span className="flex flex-col">
                <span className="text-sm leading-tight">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.role}</span>
              </span>
              {t.id === tenant.id && <Check className="ml-auto h-4 w-4 text-[#10b981]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button className="grid h-9 w-9 place-items-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition-colors hover:text-foreground">
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </header>
  );
}
