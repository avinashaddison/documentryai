import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Wand2,
  Layers,
  Cloud
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
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3
    }));
    setParticles(newParticles);
  }, []);

  const navItems = [
    { 
      icon: Wand2, 
      label: "Create Documentary", 
      href: "/create",
      description: "Start a new documentary",
      gradient: "from-[#7163EB] via-fuchsia-500 to-pink-500",
      glowColor: "rgba(113, 99, 235, 0.6)",
      isSpecial: true
    },
    { 
      icon: Layers, 
      label: "Video Generated", 
      href: "/projects",
      description: "View all projects",
      gradient: "from-cyan-500 via-blue-500 to-violet-500",
      glowColor: "rgba(6, 182, 212, 0.5)"
    },
    { 
      icon: Cloud, 
      label: "Saved Videos", 
      href: "/saved",
      description: "Cloud storage",
      gradient: "from-emerald-500 via-teal-500 to-cyan-500",
      glowColor: "rgba(16, 185, 129, 0.5)"
    },
  ];

  return (
    <div className="flex h-screen w-full bg-[#030306] overflow-hidden">
      <aside 
        className={cn(
          "border-r border-[#7163EB]/10 bg-gradient-to-b from-[#0a0a14] via-[#080810] to-[#0a0a14] flex flex-col transition-all duration-500 ease-out relative overflow-hidden",
          isCollapsed ? "w-[76px]" : "w-[260px]"
        )}
      >
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="absolute w-1 h-1 rounded-full bg-[#7163EB]/30 animate-float"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${4 + Math.random() * 2}s`
              }}
            />
          ))}
        </div>
        
        {/* Top gradient glow */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#7163EB]/10 via-fuchsia-500/5 to-transparent pointer-events-none" />
        
        {/* Bottom gradient glow */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cyan-500/5 via-[#7163EB]/5 to-transparent pointer-events-none" />
        
        {/* Side accent line */}
        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-[#7163EB]/40 via-fuchsia-500/20 to-cyan-500/40" />
        
        {/* Header */}
        <div className={cn(
          "p-4 flex items-center border-b border-[#7163EB]/10 relative z-10",
          isCollapsed ? "justify-center" : "gap-3"
        )}>
          <div className="relative group cursor-pointer">
            {/* Animated outer glow rings */}
            <div className="absolute inset-[-6px] rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-500">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7163EB] via-fuchsia-500 to-cyan-500 blur-xl animate-pulse" />
            </div>
            <div className="absolute inset-[-3px] rounded-xl bg-gradient-to-br from-[#7163EB]/60 via-fuchsia-500/40 to-pink-500/60 blur-md group-hover:blur-lg transition-all duration-300" />
            
            {/* Spinning conic gradient border */}
            <div className="absolute inset-[-1px] rounded-xl overflow-hidden">
              <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#7163EB,#d946ef,#06b6d4,#7163EB)] animate-[spin_3s_linear_infinite] opacity-70 group-hover:opacity-100" />
            </div>
            
            {/* Icon container */}
            <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center shadow-2xl shadow-[#7163EB]/40 overflow-hidden border border-white/10 group-hover:scale-110 transition-all duration-300">
              <img 
                src={magicWandIcon} 
                alt="Petr AI"
                className="h-8 w-8 object-contain group-hover:rotate-12 group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_12px_rgba(113,99,235,0.8)]"
              />
              {/* Sparkle effects */}
              <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
              <div className="absolute bottom-1 left-1 w-1 h-1 bg-[#7163EB] rounded-full animate-pulse" />
              <div className="absolute top-2 left-2 w-0.5 h-0.5 bg-fuchsia-400 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
            </div>
          </div>
          
          {!isCollapsed && (
            <div className="overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="flex items-center gap-2">
                <span className="font-black text-xl tracking-tight bg-gradient-to-r from-[#7163EB] via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(113,99,235,0.5)]">
                  Petr AI
                </span>
                <div className="relative">
                  <Sparkles className="h-4 w-4 text-[#7163EB] animate-pulse" />
                  <Sparkles className="absolute inset-0 h-4 w-4 text-fuchsia-400 animate-ping opacity-30" />
                </div>
              </div>
              <p className="text-[11px] font-semibold bg-gradient-to-r from-[#7163EB]/80 via-fuchsia-400/80 to-cyan-400/80 bg-clip-text text-transparent tracking-wide">
                Documentary Studio
              </p>
            </div>
          )}
        </div>

        {/* Collapse button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-[72px] h-6 w-6 rounded-full border border-[#7163EB]/50 bg-[#0a0a14] hover:bg-[#7163EB]/20 z-50 hover:border-[#7163EB] transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-[#7163EB]/30"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-[#7163EB]" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-[#7163EB]" />
          )}
        </Button>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-2 relative z-10">
          {navItems.map((item, index) => {
            const isActive = location === item.href || 
              (item.href === "/create" && (location === "/" || location === "/documentary-maker" || location.startsWith("/create") || location.startsWith("/documentary-maker/")));
            const isHovered = hoveredItem === item.href;
            
            return (
              <Link key={item.href} href={item.href}>
                <div
                  onMouseEnter={() => setHoveredItem(item.href)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 group cursor-pointer overflow-hidden",
                    isActive ? "text-white" : "text-white/60 hover:text-white",
                    isCollapsed && "justify-center px-2"
                  )}
                  style={{
                    animationDelay: `${index * 100}ms`
                  }}
                  data-testid={`nav-${item.href.replace("/", "")}`}
                >
                  {/* Special glow for Create Documentary */}
                  {item.isSpecial && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#7163EB]/20 via-fuchsia-500/10 to-[#7163EB]/20 rounded-xl animate-pulse" />
                  )}
                  
                  {/* Active state background */}
                  {isActive && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-r from-[#7163EB]/30 via-fuchsia-500/20 to-[#7163EB]/30 rounded-xl blur-sm" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#7163EB]/40 via-fuchsia-500/30 to-cyan-500/40 rounded-xl" />
                      <div className="absolute inset-0 border border-[#7163EB]/40 rounded-xl" />
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-xl" />
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#7163EB] via-fuchsia-500 to-cyan-500 rounded-l-xl" />
                    </>
                  )}
                  
                  {/* Hover state */}
                  {(isHovered && !isActive) && (
                    <>
                      <div className="absolute inset-0 bg-white/5 transition-all duration-300 rounded-xl" />
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#7163EB]/50 via-fuchsia-500/50 to-cyan-500/50 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    </>
                  )}
                  
                  {/* Icon */}
                  <div className={cn(
                    "relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110",
                    item.isSpecial
                      ? "bg-gradient-to-br from-[#7163EB]/30 via-fuchsia-500/20 to-pink-500/30"
                      : isActive 
                        ? `bg-gradient-to-br ${item.gradient}` 
                        : "bg-white/5 group-hover:bg-white/10"
                  )}>
                    {/* Icon glow */}
                    {(item.isSpecial || isActive) && (
                      <div 
                        className="absolute inset-[-4px] rounded-xl blur-lg opacity-60 animate-pulse"
                        style={{ backgroundColor: item.glowColor }}
                      />
                    )}
                    
                    {/* Spinning border for special item */}
                    {item.isSpecial && (
                      <div className="absolute inset-[-1px] rounded-xl overflow-hidden">
                        <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#7163EB,#d946ef,#ec4899,#7163EB)] animate-[spin_4s_linear_infinite] opacity-60" />
                      </div>
                    )}
                    
                    <item.icon className={cn(
                      "h-5 w-5 transition-all duration-300 relative z-10",
                      item.isSpecial 
                        ? "text-[#7163EB] drop-shadow-[0_0_10px_rgba(113,99,235,0.8)] group-hover:text-fuchsia-400"
                        : isActive 
                          ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" 
                          : "text-white/50 group-hover:text-[#7163EB]"
                    )} />
                  </div>
                  
                  {/* Text */}
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0 relative z-10">
                      <span className={cn(
                        "block truncate transition-colors duration-300 text-[13px]",
                        isActive ? "font-bold text-white" : "font-semibold",
                        item.isSpecial && !isActive && "bg-gradient-to-r from-[#7163EB] to-fuchsia-400 bg-clip-text text-transparent"
                      )}>{item.label}</span>
                      <span className={cn(
                        "text-[10px] truncate block transition-colors duration-300",
                        isActive ? "text-[#7163EB]/80" : "text-white/40"
                      )}>
                        {item.description}
                      </span>
                    </div>
                  )}
                  
                  {/* Active indicator dot */}
                  {isActive && !isCollapsed && (
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-[#7163EB] animate-pulse" />
                      <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#7163EB] animate-ping opacity-40" />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Pro Tip section */}
        <div className={cn(
          "p-3 border-t border-[#7163EB]/10 relative z-10",
          isCollapsed && "flex justify-center"
        )}>
          {!isCollapsed ? (
            <div className="relative group overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#7163EB]/10 via-fuchsia-500/5 to-cyan-500/10 rounded-xl" />
              
              {/* Animated shimmer */}
              <div className="absolute inset-0 overflow-hidden rounded-xl">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>
              
              {/* Content */}
              <div className="relative rounded-xl p-3.5 border border-[#7163EB]/20 group-hover:border-[#7163EB]/40 transition-colors duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-[#7163EB]/20 to-fuchsia-500/20">
                    <Zap className="h-3.5 w-3.5 text-[#7163EB]" />
                    <Zap className="absolute inset-0 h-3.5 w-3.5 text-[#7163EB] animate-ping opacity-30 m-1.5" />
                  </div>
                  <span className="text-xs font-bold bg-gradient-to-r from-[#7163EB] via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                    Pro Tip
                  </span>
                </div>
                <p className="text-[10px] text-white/50 leading-relaxed">
                  Your progress is auto-saved. Refresh anytime and resume where you left off.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative group">
              <div className="absolute inset-[-4px] bg-gradient-to-br from-[#7163EB] to-fuchsia-500 rounded-xl blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-300" />
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-[#7163EB]/20 to-fuchsia-500/20 border border-[#7163EB]/30 flex items-center justify-center group-hover:border-[#7163EB]/60 group-hover:scale-110 transition-all duration-300">
                <Zap className="h-4 w-4 text-[#7163EB]" />
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
