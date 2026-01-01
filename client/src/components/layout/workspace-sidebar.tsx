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
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkspaceSidebarProps {
  children: React.ReactNode;
}

export function WorkspaceSidebar({ children }: WorkspaceSidebarProps) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { 
      icon: PlusCircle, 
      label: "Create Documentary", 
      href: "/create",
      description: "Start a new documentary"
    },
    { 
      icon: FolderOpen, 
      label: "Video Generated", 
      href: "/projects",
      description: "View all projects"
    },
    { 
      icon: Save, 
      label: "Saved Videos", 
      href: "/saved",
      description: "Cloud storage"
    },
  ];

  return (
    <div className="flex h-screen w-full bg-[#0a0a0f] overflow-hidden">
      <aside 
        className={cn(
          "border-r border-orange-500/10 bg-[#0d0d14] flex flex-col transition-all duration-300 ease-in-out relative",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className={cn(
          "p-4 flex items-center border-b border-orange-500/10",
          isCollapsed ? "justify-center" : "gap-3"
        )}>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
            <Film className="h-5 w-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">
                Petr AI
              </span>
              <p className="text-[10px] text-muted-foreground">Documentary Studio</p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-16 h-6 w-6 rounded-full border border-orange-500/30 bg-[#0d0d14] hover:bg-orange-500/10 z-50"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-orange-400" />
          ) : (
            <ChevronLeft className="h-3 w-3 text-orange-400" />
          )}
        </Button>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href === "/create" && location === "/");
            
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
                    isActive
                      ? "bg-gradient-to-r from-orange-500/20 to-amber-500/10 text-orange-400 border border-orange-500/30"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white border border-transparent",
                    isCollapsed && "justify-center px-2"
                  )}
                  data-testid={`nav-${item.href.replace("/", "")}`}
                >
                  <item.icon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive ? "text-orange-400" : "text-muted-foreground group-hover:text-orange-400"
                  )} />
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {item.description}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className={cn(
          "p-3 border-t border-orange-500/10",
          isCollapsed && "flex justify-center"
        )}>
          {!isCollapsed ? (
            <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/5 rounded-xl p-3 border border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                <span className="text-xs font-semibold text-orange-300">Pro Tip</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Your progress is auto-saved. Refresh anytime and resume where you left off.
              </p>
            </div>
          ) : (
            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-orange-400" />
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
