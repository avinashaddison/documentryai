import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Film, 
  PlusCircle, 
  Video, 
  Save,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Sparkles,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import magicWandIcon from "@assets/magic-wand_1767591284061.png";

interface WorkspaceSidebarProps {
  children: React.ReactNode;
}

export function WorkspaceSidebar({ children }: WorkspaceSidebarProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems = [
    { 
      icon: PlusCircle, 
      label: "Create Documentary", 
      href: "/create",
      description: "Start a new documentary",
      gradient: "from-cyan-500 to-blue-600"
    },
    { 
      icon: FolderOpen, 
      label: "Video Generated", 
      href: "/projects",
      description: "View all projects",
      gradient: "from-violet-500 to-purple-600"
    },
    { 
      icon: Save, 
      label: "Saved Videos", 
      href: "/saved",
      description: "Cloud storage",
      gradient: "from-pink-500 to-rose-600"
    },
  ];

  return (
    <div className="flex h-screen w-full bg-[#050508] overflow-hidden">
      <aside 
        className={cn(
          "border-r border-cyan-500/10 bg-gradient-to-b from-[#0a0a12] to-[#080810] flex flex-col transition-all duration-500 ease-out relative",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-violet-500/5 to-transparent pointer-events-none" />
        
        <div className={cn(
          "p-4 flex items-center border-b border-cyan-500/10 relative z-10",
          isCollapsed ? "justify-center" : "gap-3"
        )}>
          <div className="relative group cursor-pointer">
            {/* Animated glow rings */}
            <div className="absolute inset-[-4px] rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-500 opacity-0 group-hover:opacity-60 blur-lg transition-all duration-500 animate-pulse" />
            <div className="absolute inset-[-2px] rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 opacity-40 blur-md group-hover:opacity-70 transition-all duration-300" />
            
            {/* Spinning border effect */}
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,#a855f7_60deg,#ec4899_120deg,#06b6d4_180deg,#a855f7_240deg,#ec4899_300deg,transparent_360deg)] animate-[spin_4s_linear_infinite] opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
            
            {/* Icon container */}
            <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center flex-shrink-0 shadow-xl shadow-purple-500/30 overflow-hidden border border-white/10 group-hover:scale-105 transition-transform duration-300">
              <img 
                src={magicWandIcon} 
                alt="Petr AI"
                className="h-8 w-8 object-contain group-hover:rotate-12 group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
              />
              {/* Sparkle effects */}
              <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-75" />
              <div className="absolute bottom-2 left-1 w-1 h-1 bg-cyan-400 rounded-full animate-pulse" />
            </div>
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-xl tracking-tight bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)] animate-[pulse_3s_ease-in-out_infinite]">
                  Petr AI
                </span>
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-400 animate-pulse" />
              </div>
              <p className="text-[10px] font-medium bg-gradient-to-r from-cyan-300/80 to-violet-300/80 bg-clip-text text-transparent">Documentary Studio</p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-16 h-6 w-6 rounded-full border border-cyan-500/40 bg-[#0a0a12] hover:bg-cyan-500/20 z-50 hover:border-cyan-400 transition-all duration-300 hover:scale-110"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-cyan-400" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-cyan-400" />
          )}
        </Button>

        <nav className="flex-1 px-2 py-4 space-y-2 relative z-10">
          {navItems.map((item, index) => {
            const isActive = location === item.href || 
              (item.href === "/create" && location === "/");
            const isHovered = hoveredItem === item.href;
            
            return (
              <Link key={item.href} href={item.href}>
                <div
                  onMouseEnter={() => setHoveredItem(item.href)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 group cursor-pointer overflow-hidden",
                    isActive
                      ? "text-white"
                      : "text-muted-foreground hover:text-white",
                    isCollapsed && "justify-center px-2"
                  )}
                  style={{
                    animationDelay: `${index * 100}ms`
                  }}
                  data-testid={`nav-${item.href.replace("/", "")}`}
                >
                  {isActive && (
                    <>
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-r opacity-20",
                        item.gradient
                      )} />
                      <div className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b",
                        item.gradient
                      )} />
                      <div className={cn(
                        "absolute inset-0 border border-white/10 rounded-xl"
                      )} />
                    </>
                  )}
                  
                  {(isHovered && !isActive) && (
                    <div className="absolute inset-0 bg-white/5 transition-all duration-300 rounded-xl" />
                  )}
                  
                  <div className={cn(
                    "relative flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300",
                    isActive 
                      ? `bg-gradient-to-br ${item.gradient} shadow-lg` 
                      : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    <item.icon className={cn(
                      "h-4 w-4 transition-all duration-300",
                      isActive ? "text-white" : "text-muted-foreground group-hover:text-cyan-400"
                    )} />
                  </div>
                  
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0 relative z-10">
                      <span className={cn(
                        "block truncate transition-colors duration-300",
                        isActive && "font-semibold"
                      )}>{item.label}</span>
                      <span className={cn(
                        "text-[10px] truncate block transition-colors duration-300",
                        isActive ? "text-white/60" : "text-muted-foreground"
                      )}>
                        {item.description}
                      </span>
                    </div>
                  )}
                  
                  {isActive && !isCollapsed && (
                    <Zap className="h-3 w-3 text-cyan-400 animate-pulse" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className={cn(
          "p-3 border-t border-cyan-500/10 relative z-10",
          isCollapsed && "flex justify-center"
        )}>
          {!isCollapsed ? (
            <div className="relative group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-pink-500/10 rounded-xl" />
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 animate-shimmer" />
              <div className="relative rounded-xl p-3 border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative">
                    <Sparkles className="h-4 w-4 text-cyan-400" />
                    <div className="absolute inset-0 text-cyan-400 animate-ping opacity-30">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>
                  <span className="text-xs font-semibold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Pro Tip</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your progress is auto-saved. Refresh anytime and resume where you left off.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-violet-600 rounded-lg blur-sm opacity-30 group-hover:opacity-50 transition-opacity duration-300" />
              <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:border-cyan-400/50 transition-all duration-300">
                <Sparkles className="h-4 w-4 text-cyan-400" />
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
